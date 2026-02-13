import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, Animated, Platform } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

const PENNY_LOADING_VIDEO = require('../../assets/PennyLoading.mp4');

interface LoadingScreenProps {
  onFinish: () => void;
  /** When false, animation keeps playing; when true, 3s countdown then fade and onFinish. Default true. */
  readyToDismiss?: boolean;
}

export default function LoadingScreen({ onFinish, readyToDismiss = true }: LoadingScreenProps) {
  const [isVisible, setIsVisible] = useState(true);
  const opacity = useRef(new Animated.Value(1)).current;
  const dismissTimerStartedRef = useRef(false);

  // Video is 5s; play at 5/3 speed so it completes in 3s, then we dismiss
  const player = useVideoPlayer(PENNY_LOADING_VIDEO, (p) => {
    p.loop = false;
    p.muted = true;
    p.playbackRate = 5 / 3;
    p.play();
  });

  useEffect(() => {
    if (!readyToDismiss || dismissTimerStartedRef.current) return;
    dismissTimerStartedRef.current = true;

    const timer = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        setIsVisible(false);
        onFinish();
      });
    }, 3000);

    return () => clearTimeout(timer);
  }, [readyToDismiss, opacity, onFinish]);

  if (!isVisible) {
    return null;
  }

  return (
    <Animated.View style={[styles.container, { opacity }]}>
      <View style={styles.videoWrapper}>
        <VideoView
          player={player}
          style={styles.video}
          contentFit="contain"
          nativeControls={false}
          fullscreenOptions={{ enable: false }}
          allowsPictureInPicture={false}
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fffdfe',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
  },
  videoWrapper: {
    width: '100%',
    maxWidth: 320,
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  video: {
    width: '100%',
    height: '100%',
    ...(Platform.OS === 'android' && { overflow: 'hidden' as const }),
  },
});
