import speech_recognition as sr
import os
import sys

r = sr.Recognizer()

print("=== TRANSCRIBING WAV FILES ===")
for i in [2]:
    wav_path = f"scratch/audio_new_{i}.wav"
    if not os.path.exists(wav_path):
        print(f"File {wav_path} does not exist!")
        continue
    print(f"\nProcessing {wav_path}...")
    try:
        with sr.AudioFile(wav_path) as source:
            audio = r.record(source)
        text = r.recognize_google(audio, language="pt-BR")
        print(f"=== TRANSCRIPTION FOR {wav_path} ===")
        print(text)
        print("=========================================")
    except sr.UnknownValueError:
        print(f"Google Speech Recognition could not understand audio for {wav_path}")
    except sr.RequestError as e:
        print(f"Could not request results from Google Speech Recognition service for {wav_path}; {e}")
    except Exception as e:
        print(f"Error processing {wav_path}: {e}")
