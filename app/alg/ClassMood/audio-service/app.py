import ffmpeg
import numpy as np
import librosa
from scipy.io.wavfile import write
from flask import Flask, request, jsonify

class AudioProcessor:
    _instance = None

    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            cls._instance = super(AudioProcessor, cls).__new__(cls, *args, **kwargs)

        return cls._instance


    def extract_audio(self, v, out_audio='temp.wav'):
        try:
            ffmpeg.input(v).output(out_audio, vn=None, acodec='pcm_s16le', ac=1, ar='16000').run(overwrite_output=True)
        except Exception:
            raise ValueError(f'failed to bla bla bla extract audio from {v}')


    def spectral_diff(self, frame, sample):
        f_spec = np.abs(librosa.stft(frame))
        s_spec = np.abs(librosa.stft(sample))
        min_len = min(f_spec.shape[1], s_spec.shape[1])
        f_spec = f_spec[:, :min_len]
        s_spec = s_spec[:, :min_len]

        return np.linalg.norm(np.mean(f_spec, axis=1) - np.mean(s_spec, axis=1))


    def calculate_noise_qual(self, frame, all_qualities):
        result = np.sum(frame ** 2) / len(frame)
        all_qualities.append(result)

        return result


    def split_audio(self, audio_file='temp.wav', sample_file=None, frame_duration=1, threshold=60):
        audio, sr = librosa.load(audio_file, sr=None)
        sample, _ = librosa.load(sample_file, sr=sr)
        frame_len = int(frame_duration * sr)
        noise_qual = {}
        all_quals = []

        for i in range(0, len(audio), frame_len):
            frame = audio[i:i + frame_len]
            if len(frame) < frame_len:
                frame = np.pad(frame, (0, frame_len - len(frame)))
            diff = self.spectral_diff(frame, sample)
            if diff >= threshold:
                result = self.calculate_noise_qual(frame, all_quals)
                noise_qual[f'({i / sr}, {(i + frame_len) / sr})'] = result

        min_qual = min(all_quals)
        max_qual = max(all_quals)

        for time, qual in noise_qual.items():
            normal_qual = np.clip(((qual - min_qual) / (max_qual - min_qual)) * 100, 0, 100)
            noise_qual[time] = normal_qual

        return noise_qual


app = Flask(__name__)

@app.route('/process_audio', methods=['POST'])
def api_process_audio():
    data = request.json
    video_path = data.get('video_path')
    sample_path = data.get('sample_path')

    if not video_path or not sample_path:
        return jsonify({'error': 'video_path and sample_path are required'}), 400

    try:
        audio_processor = AudioProcessor()
        audio_processor.extract_audio(video_path)
        result = audio_processor.split_audio(sample_file=sample_path)
        return jsonify({'result': result})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)