import React, { useState, useRef } from "react";
import "./App.css";

export default function App() {
  const [recording, setRecording] = useState(false);
  const [messages, setMessages] = useState([]);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  async function startRecording() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
    mediaRecorderRef.current = mr;
    chunksRef.current = [];

    mr.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    mr.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });

      // --- Whisper transcription ---
      const fd = new FormData();
      fd.append("file", blob, "audio.webm");
      fd.append("model", "whisper-1");

      const transResp = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}` },
        body: fd
      });
      const transJson = await transResp.json();
      const userText = transJson.text;
      setMessages((m) => [...m, { sender: "user", text: userText }]);

      // --- GPT reply ---
      const chatResp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: "You are a helpful Caremark PBM assistant." },
            { role: "user", content: userText }
          ]
        })
      });
      const chatJson = await chatResp.json();
      const reply = chatJson.choices[0].message.content;
      setMessages((m) => [...m, { sender: "assistant", text: reply }]);

      // --- ElevenLabs voice ---
      const elevenResp = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${import.meta.env.VITE_ELEVENLABS_VOICE_ID}`,
        {
          method: "POST",
          headers: {
            "xi-api-key": import.meta.env.VITE_ELEVENLABS_API_KEY,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ text: reply, model_id: "eleven_multilingual_v2" })
        }
      );

      const audioBlob = await elevenResp.blob();
      const url = URL.createObjectURL(audioBlob);
      new Audio(url).play();
    };

    mr.start();
    setRecording(true);
  }

  function stopRecording() {
    mediaRecorderRef.current.stop();
    setRecording(false);
  }

  return (
    <div className="app">
      <div className="messages">
        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.sender}`}>
            {m.text}
          </div>
        ))}
      </div>
      <button
        className={`record-btn ${recording ? "recording" : ""}`}
        onMouseDown={startRecording}
        onMouseUp={stopRecording}
      >
        {recording ? "Release to Send" : "Talk to Caremark AI"}
      </button>
    </div>
  );
}
