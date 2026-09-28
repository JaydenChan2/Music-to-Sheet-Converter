"""Smoke test: synthesise a low E, send it through the backend job API and check the tab."""
import os
import time

import numpy as np
import requests
import scipy.io.wavfile

BASE_URL = os.environ.get("BACKEND_URL", "http://127.0.0.1:5001") + "/api"
filename = "test_e2.wav"


def make_test_file():
    sr = 22050
    t = np.linspace(0, 2.0, int(sr * 2.0), endpoint=False)
    f = 82.41  # E2
    y = sum(np.sin(2 * np.pi * k * f * t) / k for k in range(1, 6)) * np.exp(-2 * t)
    scipy.io.wavfile.write(filename, sr, (y / np.abs(y).max() * 0.8 * 32767).astype(np.int16))


def run_test():
    make_test_file()
    try:
        with open(filename, "rb") as f:
            r = requests.post(f"{BASE_URL}/jobs", files={"file": f}, data={"separate": "false"})
        r.raise_for_status()
        job_id = r.json()["id"]
        print(f"Job {job_id} created")

        while True:
            job = requests.get(f"{BASE_URL}/jobs/{job_id}").json()
            if job["status"] != "running":
                break
            time.sleep(0.5)

        if job["status"] != "done":
            print(f"Processing failed: {job['error']}")
            return False

        tabs = job["result"]["tabs"]
        print(f"Tabs found: {len(tabs)}, tempo: {job['result']['tempo']}")
        first_note = tabs[0]["notes"] if tabs else {}
        print(f"First note: {first_note}")
        # Visual string 5 is the low E string
        if first_note.get("5") == 0:
            print("PITCH VERIFIED: Correctly identified Low E (E2).")
            return True
        print("PITCH CHECK FAILED: expected low E open string.")
        return False
    finally:
        if os.path.exists(filename):
            os.remove(filename)


if __name__ == "__main__":
    print("VERIFICATION_SUCCESS" if run_test() else "VERIFICATION_FAILURE")
