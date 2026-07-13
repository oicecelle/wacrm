import speech_recognition as sr
import json

r = sr.Recognizer()
wav_path = "scratch/audio_1.wav"

with sr.AudioFile(wav_path) as source:
    # Adjust for ambient noise
    r.adjust_for_ambient_noise(source, duration=1.0)
    audio = r.record(source)

print("Attempting to transcribe audio_1.wav...")
try:
    # Try with show_all=True to see raw API response
    res = r.recognize_google(audio, language="pt-BR", show_all=True)
    print("Raw Response:", json.dumps(res, indent=2))
except Exception as e:
    print("Error:", e)
