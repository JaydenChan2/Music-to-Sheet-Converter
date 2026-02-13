from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import os
import logging

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Configure logging
logging.basicConfig(level=logging.INFO)

UPLOAD_FOLDER = 'uploads'
OUTPUT_FOLDER = 'outputs'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

@app.route('/')
def home():
    return "Backend is running!"


@app.route('/api/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
        
    if file:
        filename = file.filename
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        logging.info(f"File saved to {filepath}")
        return jsonify({'message': 'File uploaded successfully', 'filename': filename}), 200

@app.route('/api/process', methods=['POST'])
def process_audio_route():
    data = request.get_json()
    if not data or 'filename' not in data:
        return jsonify({'error': 'Filename is required'}), 400
        
    filename = data['filename']
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    
    if not os.path.exists(filepath):
        return jsonify({'error': 'File not found'}), 404
        
    # Process the audio
    # This might take time, in a real app use Celery/Redis queue
    # Here we block for simplicity as per requirements (<10s for minute of audio)
    try:
        from audio_processor import process_audio
        result = process_audio(filepath)
        
        if result['status'] == 'error':
            return jsonify({'error': result['message']}), 500
            
        return jsonify(result), 200
    except Exception as e:
        logging.error(f"Processing error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/export/<format_type>', methods=['POST'])
def export_tabs(format_type):
    data = request.get_json()
    tabs = data.get('tabs')
    
    if not tabs:
        return jsonify({'error': 'No tab data provided'}), 400
        
    output_filename = f"tabs_{format_type}.txt" # placeholder
    output_path = os.path.join(app.config['OUTPUT_FOLDER'], output_filename)
    
    # Implement export logic based on format_type 'pdf', 'midi', 'txt'
    # For now, just a text dump
    with open(output_path, 'w') as f:
        f.write(str(tabs))
        
    return send_file(output_path, as_attachment=True)

if __name__ == '__main__':
    app.run(debug=True, port=5000)
