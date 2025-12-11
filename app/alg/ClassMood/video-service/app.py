import os
import cv2
import torch
import torch.nn as nn
import mediapipe as mp
from pathlib import Path
from collections import deque
from statistics import median
from ultralytics import YOLO
from flask import Flask, request, jsonify

MODEL_PATH = os.getenv('INTEREST_MODEL_PATH', 'models/interest_predictor.pth')
FACE_MODEL_PATH = os.getenv('FACE_MODEL_PATH', 'models/yolov8n-face-lindevs.pt')

# Инициализация модели

class InterestPredictor(nn.Module):
    def __init__(self, input_size=3, hidden_size=10):
        super(InterestPredictor, self).__init__()
        self.fc1 = nn.Linear(input_size, hidden_size)
        self.relu = nn.ReLU()
        self.fc2 = nn.Linear(hidden_size, 1)

    def forward(self, x):
        x = self.fc1(x)
        x = self.relu(x)
        x = self.fc2(x)
        return x


class InterestPredictorService:
    _instance = None
    _initialized = False

    def __new__(cls, model_path: str):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self, model_path: str = None):
        if self._initialized:
            return
        self.model_path = Path(model_path)
        if not self.model_path.exists():
            raise FileNotFoundError(f'Model not found: {self.model_path}')
        
        self.model = InterestPredictor(input_size=2, hidden_size=10)
        self.model.load_state_dict(torch.load(self.model_path, map_location='cpu'))
        self.model.eval()
        self._initialized = True
    
    def predict(self, features):
        with torch.no_grad():
            output = self.model(torch.tensor(features, dtype=torch.float32))
            return output.item()

# Фабрика

class ServiceFactory:
    @staticmethod
    def create_interest_service(model_path: str = MODEL_PATH):
        return InterestPredictorService(model_path)
    
    @staticmethod
    def create_headpose_service(face_model_path: str = FACE_MODEL_PATH):
        return HeadPoseService(face_model_path)

# Основной сервис

class HeadPoseService:
    __slots__ = ('bb_detection', 'face_mesh', 'interest_service')

    def __init__(self, face_model_path: str):
        self.bb_detection = YOLO(face_model_path)
        self.face_mesh = mp.solutions.face_mesh.FaceMesh(
            static_image_mode=True,
            max_num_faces=1,
            refine_landmarks=True,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5
        )

    def frame_headpose(self, path):
        bb_results = self.bb_detection(path, conf=0.4, verbose=False)

        if not isinstance(path, str):
            image = path
        else:
            image = cv2.imread(path)
            if image is None:
                raise ValueError(f'Could not load image from {path}')

        if not bb_results:
            return None

        w = image.shape[1]
        boxes = bb_results[0].boxes.xyxy.numpy()
        head_rotations = dict()
        point_names = ('chin', 'nose', 'le_in', 're_in')

        for face_id, coords in enumerate(boxes):
            face_roi = image[int(coords[1]):int(coords[3]), int(coords[0]):int(coords[2])]
            mesh_results = self.face_mesh.process(cv2.cvtColor(face_roi, cv2.COLOR_BGR2RGB))
            if not mesh_results.multi_face_landmarks:
                continue


            roi_h, roi_w = face_roi.shape[:2]
            landmarks_2d = dict(zip(
                point_names[1:], 
                [(mesh_results.multi_face_landmarks[0].landmark[i].x, 
                mesh_results.multi_face_landmarks[0].landmark[i].y) for i in (1, 130, 359)]))
            landmarks_Z = dict(zip(
                point_names[:2],
                [(mesh_results.multi_face_landmarks[0].landmark[i].z) for i in (152, 1)]))
            
            left_dist = (((landmarks_2d['le_in'][0] - landmarks_2d['nose'][0]) ** 2 + 
                        (landmarks_2d['le_in'][1] - landmarks_2d['nose'][1]) ** 2) ** 0.5)
            right_dist = (((landmarks_2d['re_in'][0] - landmarks_2d['nose'][0]) ** 2 
                        + (landmarks_2d['re_in'][1] - landmarks_2d['nose'][1]) ** 2) ** 0.5)
            
            yaw_approx = (left_dist - right_dist) / roi_w * 100000
            pitch_approx = (landmarks_Z['nose'] + landmarks_Z['chin']) * -100

            scale_factor = (w / max((coords[0] + coords[2]), 0.1 ** 6))
            head_rotations[face_id] = (yaw_approx / scale_factor, pitch_approx)

        return head_rotations

    def video_interest(self, path, frame_skip=10):
        interest_service = ServiceFactory.create_interest_service()
        cap = cv2.VideoCapture(path)
        if not cap.isOpened():
            raise ValueError(f'Failed to open video {path}')

        frame_count = 0
        fps = cap.get(cv2.CAP_PROP_FPS)
        interest_per_time = {}

        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break

            if frame_count % frame_skip == 0:
                try:
                    temp = self.frame_headpose(frame)
                    predicted = []
                    for face_id, (yaw, pitch) in temp.items():
                        score = int(interest_service.predict((yaw, pitch)))
                        predicted.append(score)
                    if predicted:
                        avg_score = sum(predicted) / len(predicted)
                        interest_per_time[round(frame_count / fps, 3)] = avg_score
                except Exception:
                    pass
            frame_count += 1
        cap.release()

        return interest_per_time


app = Flask(__name__)

@app.route('/process_video', methods=['POST'])
def process_video():
    headpose_service = ServiceFactory.create_headpose_service()

    data = request.json
    video_path = data.get('video_path')

    if not video_path:
        return jsonify({'error': 'video_path is required'}), 400
    
    try:
        result = headpose_service.video_interest(video_path, frame_skip=10)
        return jsonify({'result': result})
    except Exception as e:
        return jsonify({'error': str(e)}), 500



if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)