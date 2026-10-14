"use client";

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";

export function QrScanner({
  onDetected,
  onCancel,
}: {
  onDetected: (value: string) => void;
  onCancel: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const detectedRef = useRef(false);
  const onDetectedRef = useRef(onDetected);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  useEffect(() => {
    let active = true;

    const stopCamera = () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };

    const tick = () => {
      if (!active || detectedRef.current) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const result = jsQR(image.data, image.width, image.height, {
            inversionAttempts: "dontInvert",
          });
          if (result?.data) {
            detectedRef.current = true;
            onDetectedRef.current(result.data);
            return;
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    const start = async () => {
      if (typeof window !== "undefined" && !window.isSecureContext) {
        setError(
          `กล้องใช้ได้เฉพาะเมื่อเปิดผ่าน HTTPS หรือ localhost เท่านั้น — ตอนนี้เปิดผ่าน ${window.location.origin} กรุณาใช้ https://${window.location.host}`,
        );
        return;
      }
      if (
        typeof navigator === "undefined" ||
        !navigator.mediaDevices?.getUserMedia
      ) {
        setError("เบราว์เซอร์นี้ไม่รองรับการใช้งานกล้อง");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play();
        }
        rafRef.current = requestAnimationFrame(tick);
      } catch (err) {
        const name = (err as { name?: string } | undefined)?.name;
        if (name === "NotAllowedError" || name === "SecurityError") {
          setError("คุณไม่ได้อนุญาตให้เข้าถึงกล้อง กรุณาเปิดสิทธิ์แล้วลองใหม่");
        } else if (name === "NotFoundError") {
          setError("ไม่พบกล้องบนอุปกรณ์นี้");
        } else if (name === "NotReadableError") {
          setError("กล้องถูกใช้งานโดยแอปอื่นอยู่ กรุณาปิดแอปนั้นแล้วลองใหม่");
        } else {
          setError("ไม่สามารถเปิดกล้องได้ กรุณาลองใหม่อีกครั้ง");
        }
      }
    };

    void start();

    return () => {
      active = false;
      stopCamera();
    };
  }, []);

  return (
    <div className="space-y-3">
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      ) : (
        <div className="relative overflow-hidden rounded-2xl border border-slate-300 bg-black dark:border-neutral-700">
          <video
            ref={videoRef}
            playsInline
            muted
            className="h-64 w-full object-cover"
          />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-40 w-40 rounded-2xl border-2 border-white/80" />
          </div>
        </div>
      )}
      <canvas ref={canvasRef} className="hidden" />
      <p className="text-center text-xs text-slate-500 dark:text-slate-400">
        เล็ง QR ให้อยู่ในกรอบ
      </p>
      <button
        type="button"
        onClick={onCancel}
        className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-neutral-700 dark:text-slate-200 dark:hover:bg-neutral-800"
      >
        ยกเลิก
      </button>
    </div>
  );
}
