"use client";

// Camera QR scanner for the Delivery Person App (2B-6B-1).
//
// Uses @zxing/browser (cross-platform: Android Chrome + iOS Safari). It decodes
// the physical shipment label into the authoritative shipmentNumber+scanToken
// payload and hands it to the caller — it NEVER logs the decoded text, never
// shows the scanToken, and stops the camera cleanly on success/close/unmount
// (the camera does not keep running after a successful scan).
import { useEffect, useRef, useState } from "react";
import { BrowserQRCodeReader } from "@zxing/browser";
import type { IScannerControls } from "@zxing/browser";
import { parseScannedPayload, type ScanPayload } from "@/lib/deliveryApp/scanClient";

export default function QrScanner({
  title,
  onResult,
  onClose,
}: {
  title: string;
  onResult: (payload: ScanPayload) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const handledRef = useRef(false); // guard: act on the first valid decode only
  const [status, setStatus] = useState<"starting" | "scanning" | "denied" | "unavailable" | "invalid">("starting");

  useEffect(() => {
    let cancelled = false;
    const reader = new BrowserQRCodeReader();

    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) { setStatus("unavailable"); return; }
        const controls = await reader.decodeFromVideoDevice(undefined, videoRef.current || undefined, (result) => {
          if (handledRef.current || !result) return;
          const payload = parseScannedPayload(result.getText()); // decoded text never logged
          if (!payload) { setStatus("invalid"); return; } // keep scanning; show hint
          handledRef.current = true;
          controlsRef.current?.stop(); // stop the camera immediately after a valid scan
          onResult(payload);
        });
        if (cancelled) { controls.stop(); return; }
        controlsRef.current = controls;
        setStatus("scanning");
      } catch (err) {
        const name = (err as { name?: string })?.name || "";
        setStatus(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "unavailable");
      }
    }
    void start();

    return () => {
      cancelled = true;
      controlsRef.current?.stop(); // clean shutdown on unmount
      controlsRef.current = null;
    };
  }, [onResult]);

  const close = () => { controlsRef.current?.stop(); onClose(); };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <span className="text-sm font-medium">{title}</span>
        <button onClick={close} className="rounded px-3 py-1.5 text-sm bg-white/15">Close</button>
      </div>

      <div className="relative flex-1">
        <video ref={videoRef} className="h-full w-full object-cover" muted playsInline autoPlay />
        {/* aiming frame */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-56 w-56 rounded-lg border-2 border-white/80" />
        </div>
      </div>

      <div className="px-4 py-4 text-center text-sm text-white">
        {status === "starting" && "Starting camera…"}
        {status === "scanning" && "Point the camera at the shipment QR."}
        {status === "invalid" && "That code isn’t a YOMICO shipment. Keep scanning the label QR."}
        {status === "denied" && (
          <div className="space-y-2">
            <p>Camera access was denied.</p>
            <p className="text-xs text-white/70">Enable camera permission for this site in your browser settings, then reopen the scanner.</p>
          </div>
        )}
        {status === "unavailable" && (
          <div className="space-y-2">
            <p>Camera is unavailable on this device/browser.</p>
            <p className="text-xs text-white/70">Use a device with a camera and a supported browser to scan shipments.</p>
          </div>
        )}
      </div>
    </div>
  );
}
