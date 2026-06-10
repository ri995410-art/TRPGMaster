import { useState, useRef, useCallback } from 'react';
import { Platform, Alert } from 'react-native';

/**
 * Voice capture hook using browser MediaRecorder API (web only).
 * Returns { isRecording, startRecording, stopRecording }.
 * stopRecording resolves with { audioData (base64), duration, format }.
 */
export function useVoiceCapture() {
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);

  const startRecording = useCallback(async (): Promise<boolean> => {
    if (Platform.OS !== 'web') {
      Alert.alert('语音输入', '语音功能仅支持Web平台');
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      startTimeRef.current = Date.now();

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.start(1000); // collect data every second
      setIsRecording(true);
      return true;
    } catch (err) {
      console.error('Microphone access denied:', err);
      Alert.alert('权限不足', '无法访问麦克风，请检查浏览器权限设置');
      return false;
    }
  }, []);

  const stopRecording = useCallback(async (): Promise<{ audioData: string; duration: number; format: 'wav' | 'mp3' | 'ogg' | 'webm' } | null> => {
    return new Promise((resolve) => {
      const mediaRecorder = mediaRecorderRef.current;
      if (!mediaRecorder || mediaRecorder.state !== 'recording') {
        setIsRecording(false);
        resolve(null);
        return;
      }

      mediaRecorder.onstop = async () => {
        const duration = (Date.now() - startTimeRef.current) / 1000;
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });

        // Convert to base64
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result as string;
          // Remove data:audio/webm;base64, prefix
          const audioData = base64.split(',')[1] || base64;
          setIsRecording(false);

          // Stop all tracks
          if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
          }

          resolve({ audioData, duration, format: 'webm' });
        };
        reader.onerror = () => {
          setIsRecording(false);
          resolve(null);
        };
        reader.readAsDataURL(blob);
      };

      mediaRecorder.stop();
    });
  }, []);

  return { isRecording, startRecording, stopRecording };
}

/**
 * Camera capture hook using browser getUserMedia API (web only).
 * Returns { capture, lastImage }.
 * capture() opens camera, takes a snapshot, returns base64 imageData.
 */
export function useCameraCapture() {
  const [lastImage, setLastImage] = useState<string | null>(null);

  const capture = useCallback(async (): Promise<{ imageData: string; format: 'jpeg' | 'png' } | null> => {
    if (Platform.OS !== 'web') {
      Alert.alert('视觉输入', '摄像头功能仅支持Web平台');
      return null;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: 640, height: 480 },
      });

      // Create video element to capture frame
      const video = document.createElement('video');
      video.srcObject = stream;
      video.setAttribute('playsinline', '');
      await video.play();

      // Wait a moment for camera to stabilize
      await new Promise(r => setTimeout(r, 500));

      // Capture frame to canvas
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        stream.getTracks().forEach(t => t.stop());
        return null;
      }
      ctx.drawImage(video, 0, 0);

      // Stop camera
      stream.getTracks().forEach(t => t.stop());

      // Get base64 data
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      const imageData = dataUrl.split(',')[1] || dataUrl;

      setLastImage(imageData);
      return { imageData, format: 'jpeg' };
    } catch (err) {
      console.error('Camera access denied:', err);
      Alert.alert('权限不足', '无法访问摄像头，请检查浏览器权限设置');
      return null;
    }
  }, []);

  return { capture, lastImage };
}
