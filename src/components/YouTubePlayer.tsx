"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

declare global {
  interface Window {
    YT: typeof YT;
    onYouTubeIframeAPIReady: (() => void) | undefined;
  }
}

export interface YouTubePlayerHandle {
  play: () => void;
  pause: () => void;
  getCurrentTime: () => number;
}

interface YouTubePlayerProps {
  videoId: string;
}

const YouTubePlayer = forwardRef<YouTubePlayerHandle, YouTubePlayerProps>(
  function YouTubePlayer({ videoId }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const playerRef = useRef<YT.Player | null>(null);
    const [ready, setReady] = useState(false);

    const initPlayer = useCallback(() => {
      if (!containerRef.current || playerRef.current) return;

      playerRef.current = new window.YT.Player(containerRef.current, {
        videoId,
        playerVars: {
          autoplay: 0,
          rel: 0,
          modestbranding: 1,
        },
        events: {
          onReady: () => setReady(true),
        },
      });
    }, [videoId]);

    useEffect(() => {
      // If YouTube API is already loaded, init directly
      if (window.YT?.Player) {
        initPlayer();
        return;
      }

      // Load the IFrame API script
      const existingScript = document.querySelector(
        'script[src="https://www.youtube.com/iframe_api"]'
      );
      if (!existingScript) {
        const script = document.createElement("script");
        script.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(script);
      }

      // Set callback for when API is ready
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        initPlayer();
      };

      return () => {
        // Cleanup: if the callback is still ours, restore previous
        if (window.onYouTubeIframeAPIReady === initPlayer) {
          window.onYouTubeIframeAPIReady = prev;
        }
      };
    }, [initPlayer]);

    useImperativeHandle(
      ref,
      () => ({
        play: () => {
          if (ready && playerRef.current) {
            playerRef.current.playVideo();
          }
        },
        pause: () => {
          if (ready && playerRef.current) {
            playerRef.current.pauseVideo();
          }
        },
        getCurrentTime: () => {
          if (ready && playerRef.current) {
            return playerRef.current.getCurrentTime();
          }
          return 0;
        },
      }),
      [ready]
    );

    return (
      <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
        <div ref={containerRef} className="h-full w-full" />
      </div>
    );
  }
);

export default YouTubePlayer;
