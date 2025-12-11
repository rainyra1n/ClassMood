FROM python:3.12-slim

RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    pkg-config \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    libjpeg-dev \
    libpng-dev \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

RUN python -m ensurepip --upgrade

WORKDIR /app

RUN pip install --no-cache-dir numpy==1.26.4

RUN pip install --no-cache-dir torch==2.9.1 torchvision==0.24.1  --index-url https://download.pytorch.org/whl/cpu

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .

EXPOSE 5000

CMD ["python", "app.py"]