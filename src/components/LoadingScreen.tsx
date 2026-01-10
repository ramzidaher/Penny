import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';

interface LoadingScreenProps {
  onFinish: () => void;
}

export default function LoadingScreen({ onFinish }: LoadingScreenProps) {
  const [isVisible, setIsVisible] = useState(true);
  
  const videoSource = require('../../assets/Pennt Loading animation.mp4');
  const player = useVideoPlayer(videoSource, (player) => {
    player.loop = false;
    player.muted = false;
  });

  useEffect(() => {
    // Play video when component mounts
    if (player) {
      try {
        player.play();
      } catch (error) {
        console.error('Error playing video:', error);
      }
    }

    // Hide loading screen and stop video after 3 seconds
    const timer = setTimeout(() => {
      try {
        if (player) {
          player.pause();
        }
      } catch (error) {
        // Player might already be released, ignore
      }
      setIsVisible(false);
      onFinish();
    }, 3000);

    return () => {
      clearTimeout(timer);
      // Don't try to clean up player here - it will be cleaned up automatically
      // when the component unmounts and the hook is destroyed
    };
  }, [onFinish, player]);

  if (!isVisible) {
    return null;
  }

  return (
    <View style={styles.container}>
      <VideoView
        player={player}
        style={styles.video}
        contentFit="contain"
        nativeControls={false}
        fullscreenOptions={{ enterFullscreenButton: false, exitFullscreenButton: false }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#080808', // Pure black background
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
  },
  video: {
    width: '100%',
    // Maintain 16:9 aspect ratio (1280×720) - height will be calculated automatically
    aspectRatio: 16 / 9,
    maxHeight: '100%',
  },
});

