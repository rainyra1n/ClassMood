FROM python:3.13-slim

RUN python -m ensurepip --upgrade

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .

CMD ["python", "app.py"]