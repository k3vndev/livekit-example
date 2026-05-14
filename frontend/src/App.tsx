import { useEffect, useRef, useState } from "react";
import {
  Room,
  RoomEvent,
  Track,
  type LocalTrack,
  type RemoteParticipant,
  type RemoteTrack,
  createLocalAudioTrack,
  createLocalVideoTrack,
} from "livekit-client";

export const App = () => {
  const [room] = useState(() => new Room());
  const [connected, setConnected] = useState(false);
  const videoContainerRef = useRef<HTMLDivElement | null>(null);
  const attachedVideoElements = useRef<Map<string, HTMLVideoElement>>(new Map());
  const localTracksRef = useRef<LocalTrack[]>([]);
  const hasConnectedRef = useRef(false);
  const isConnectingRef = useRef(false);
  const [loggingMessage, setLoggingMessage] = useState("");

  const { VITE_LIVEKIT_URL, VITE_BACKEND_URL } = import.meta.env;

  useEffect(() => {
    let isMounted = true;

    const attachVideoTrack = (track: RemoteTrack, participant: RemoteParticipant) => {
      if (track.kind !== Track.Kind.Video || !track.sid) {
        return;
      }

      const existing = attachedVideoElements.current.get(track.sid);
      if (existing) {
        return;
      }

      const element = track.attach() as HTMLVideoElement;
      element.autoplay = true;
      element.playsInline = true;
      element.className = "w-full max-w-3xl rounded-lg border border-blue-400";
      element.setAttribute("data-participant", participant.identity);

      if (videoContainerRef.current) {
        const div = document.createElement("div");
        div.className = "flex flex-col items-center gap-2";
        const label = document.createElement("p");
        label.textContent = participant.identity;
        label.className = "text-sm text-blue-300";
        div.appendChild(element);
        div.appendChild(label);

        videoContainerRef.current.appendChild(div);
      }

      attachedVideoElements.current.set(track.sid, element);
    };

    const detachVideoTrack = (track: RemoteTrack) => {
      if (track.kind !== Track.Kind.Video || !track.sid) {
        return;
      }

      const element = attachedVideoElements.current.get(track.sid);
      if (element) {
        const parent = element.parentElement;
        if (parent) {
          parent.remove();
        }
        attachedVideoElements.current.delete(track.sid);
      }

      track.detach();
    };

    const handleTrackSubscribed = (track: RemoteTrack, _publication: unknown, participant: RemoteParticipant) => {
      attachVideoTrack(track, participant);
    };

    const handleTrackUnsubscribed = (track: RemoteTrack) => {
      detachVideoTrack(track);
    };

    room.on(RoomEvent.TrackSubscribed, handleTrackSubscribed);
    room.on(RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed);

    async function connect() {
      if (hasConnectedRef.current || isConnectingRef.current) {
        return;
      }

      isConnectingRef.current = true;
      const identity = "user-" + Math.random().toString(36).substring(2, 8);

      const res = await fetch(
        `${VITE_BACKEND_URL}/token?identity=${encodeURIComponent(identity)}&room=pixi-room`
      );

      if (!res.ok) {
        setLoggingMessage(`Failed to fetch token: ${res.statusText}`);
        throw new Error(`Token request failed: ${res.status}`);
      }

      const { token } = await res.json();
      if (!token) {
        throw new Error("Token response is missing token");
      }
      if (!isMounted) {
        return;
      }

      await room.connect(VITE_LIVEKIT_URL, token);
      if (!isMounted) {
        room.disconnect();
        return;
      }

      setLoggingMessage(`Connected as ${identity}`);

      // On many mobile browsers, media capture only works on HTTPS/localhost.
      // If camera/mic APIs are unavailable, keep the room connection alive for playback.
      const hasGetUserMedia = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
      if (!hasGetUserMedia) {
        setLoggingMessage("Connected, but camera/mic are unavailable on this page. Use HTTPS to publish from phone.");
      } else {
        const videoTrack = await createLocalVideoTrack();
        const audioTrack = await createLocalAudioTrack();
        localTracksRef.current = [videoTrack, audioTrack];

        if (!isMounted) {
          localTracksRef.current.forEach((track) => track.stop());
          localTracksRef.current = [];
          room.disconnect();
          return;
        }

        await room.localParticipant.publishTrack(videoTrack);
        await room.localParticipant.publishTrack(audioTrack);

        setLoggingMessage("Published local tracks");
      }

      room.remoteParticipants.forEach((participant) => {
        participant.trackPublications.forEach((publication) => {
          if (publication.track && publication.track.kind === Track.Kind.Video) {
            attachVideoTrack(publication.track as RemoteTrack, participant);
          }
        });
      });

      hasConnectedRef.current = true;
      if (isMounted) {
        setConnected(true);
      }
    }

    connect().catch((error: unknown) => {
      setLoggingMessage(`Failed to connect to LiveKit: ${error}`);
      console.error("Failed to connect to LiveKit:", error);
    }).finally(() => {
      isConnectingRef.current = false;
    });

    return () => {
      isMounted = false;
      room.off(RoomEvent.TrackSubscribed, handleTrackSubscribed);
      room.off(RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed);

      attachedVideoElements.current.forEach((element) => {
        element.remove();
      });
      attachedVideoElements.current.clear();
      localTracksRef.current.forEach((track) => track.stop());
      localTracksRef.current = [];

      room.disconnect();
      hasConnectedRef.current = false;
      isConnectingRef.current = false;
      setConnected(false);
    };
  }, [room]);

  return (
    <div className="flex flex-col gap-5 text-center">
      <h1 className="font-bold text-7xl text-blue-100">LiveKit Example</h1>
      <p className="font-semibold text-3xl text-blue-300">
        {connected ? "Connected! Waiting for video tracks..." : "Connecting..."}
      </p>
      <p className="font-semibold text-2xl text-blue-200/50">{loggingMessage}</p>
      <div ref={videoContainerRef} className="flex justify-center flex-wrap gap-8" />
    </div>
  );
};

