from flask import Flask, request, jsonify
import os
import requests
import traceback
import ast
from collections import deque
from statistics import median


app = Flask(__name__)

VIDEO_PROCESSING_URL = os.getenv('VIDEO_PROCESSING_URL', 'http://video-service:5000/process_video')
AUDIO_PROCESSING_URL = os.getenv('AUDIO_PROCESSING_URL', 'http://audio-service:5000/process_audio')


def median_exponential_smoothing(values, window=7, alpha=0.1):
    if len(values) < window:
        return [min(max(i, 0), 100) for i in values]

    median_smoothed = []
    window_deque = deque(maxlen=window)

    for value in values:
        window_deque.append(value)
        median_smoothed.append(median(window_deque))

    s = median_smoothed[0]
    final_smoothed = [min(max(0, s), 1)]

    for value in median_smoothed[1:]:
        s = alpha * value + (1 - alpha) * s
        final_smoothed.append(min(max(s, 0), 1))

    return final_smoothed


def merge_interest_dicts(dict_points, dict_intervals):
    modulated_values = []

    for time in dict_points.keys():
        corresponding_value = -1

        for start, end in dict_intervals.keys():
            if start <= float(time) < end:
                corresponding_value = dict_intervals[(start, end)]
                break

        if corresponding_value != -1:
            original_value = dict_points[time]
            modulated_value = original_value * (max(min(1, 1.35 - (corresponding_value / 160)), 0))
            modulated_values.append(modulated_value * 0.013)
        else:
            modulated_values.append(dict_points[time] * 0.013)

    smoothed_values = median_exponential_smoothing(modulated_values)
    final_dict = dict(zip(dict_points.keys(), smoothed_values))

    return final_dict


def call_video_processing(video_path):
    payload = {'video_path': video_path}
    response = requests.post(VIDEO_PROCESSING_URL, json=payload, timeout=30)

    if response.status_code == 200:
        return response.json()
    else:
        raise Exception(f'Video service error: {response.status_code} {response.text}')


def call_audio_processing(video_path, sample_path):
    payload = {'video_path': video_path, 'sample_path': sample_path}
    response = requests.post(AUDIO_PROCESSING_URL, json=payload, timeout=30)

    if response.status_code == 200:
        return response.json()
    else:
        raise Exception(f'Audio service error: {response.status_code} {response.text}')


@app.route('/process', methods=['POST'])
def process():
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'JSON body required'}), 400

        video_path = data.get('video_path')
        sample_path = data.get('sample_path')

        if not video_path or not sample_path:
            return jsonify({'error': 'video_path and sample_path are required'}), 400

        result_video_raw = call_video_processing(video_path)['result']
        result_audio_raw = call_audio_processing(video_path, sample_path)['result']

        result_video = {float(k): v for k, v in result_video_raw.items()}
        result_audio = {}

        for key_str, value in result_audio_raw.items():
            try:
                key_tuple = ast.literal_eval(key_str)
                if isinstance(key_tuple, tuple) and len(key_tuple) == 2:
                    result_audio[key_tuple] = value
                else:
                    print(f'Invalid key format: {key_str}')
            except Exception as e:
                print(f'Error parsing key {key_str}: {e}')

        merged_result = merge_interest_dicts(result_video, result_audio)
        return jsonify(merged_result)

    except Exception as e:
        error_msg = f'Internal error: {str(e)}'
        print(error_msg)
        traceback.print_exc()
        return jsonify({'error': error_msg}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)
