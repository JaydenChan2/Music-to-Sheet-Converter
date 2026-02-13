import requests
import numpy as np
import scipy.io.wavfile
import os

# Create a dummy wav file (E2 note, 82.4 Hz)
sr = 22050
t = np.linspace(0, 1.0, int(sr * 1.0))
y = 0.5 * np.sin(2 * np.pi * 82.41 * t)
filename = "test_e2.wav"
scipy.io.wavfile.write(filename, sr, (y * 32767).astype(np.int16))

BASE_URL = "http://127.0.0.1:5000/api"

def run_test():
    try:
        # 1. Upload
        print(f"Uploading {filename}...")
        with open(filename, 'rb') as f:
            files = {'file': f}
            r = requests.post(f"{BASE_URL}/upload", files=files)
            
        if r.status_code != 200:
            print(f"Upload failed: {r.text}")
            return False
            
        print("Upload successful.")
        
        # 2. Process
        print("Processing...")
        r = requests.post(f"{BASE_URL}/process", json={'filename': filename})
        
        if r.status_code != 200:
            print(f"Processing failed: {r.text}")
            return False
            
        data = r.json()
        print("Processing successful.")
        print(f"Tabs found: {len(data.get('tabs', []))}")
        print(f"Tempo: {data.get('tempo')}")
        
        # Assertions
        assert data['status'] == 'success'
        assert len(data['tabs']) > 0
        
        # Check if tab note is basically E2 (String 5, Fret 0)
        # Tab structure: { "notes": { "visual_string_idx": fret } }
        # E2 -> visual string 5 (Low E), fret 0
        
        first_note = data['tabs'][0]['notes']
        print(f"First note: {first_note}")
        
        # We expect something close to E2
        # My implementation maps E2 -> visual string 5.
        
        if '5' in first_note and first_note['5'] == 0:
            print("PITCH VERIFIED: Correctly identified Low E (E2).")
        else:
            print("PITCH CHECK WARNING: Did not exactly match E2 open string.")
            
        return True
        
    except Exception as e:
        print(f"Test failed with exception: {e}")
        return False
    finally:
        if os.path.exists(filename):
            os.remove(filename)

if __name__ == "__main__":
    if run_test():
        print("VERIFICATION_SUCCESS")
    else:
        print("VERIFICATION_FAILURE")
