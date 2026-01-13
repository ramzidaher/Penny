import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';

interface LoadingScreenProps {
  onFinish: () => void;
}

export default function LoadingScreen({ onFinish }: LoadingScreenProps) {
  const [isVisible, setIsVisible] = useState(true);
  
  // Animation values
  const catSway = useRef(new Animated.Value(0)).current;
  const milkWave = useRef(new Animated.Value(0)).current;
  const bubbles = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const catScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Cat gentle breathing/swaying animation
    const catAnimation = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(catSway, {
            toValue: 1,
            duration: 2000,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(catSway, {
            toValue: 0,
            duration: 2000,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(catScale, {
            toValue: 1.05,
            duration: 2000,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(catScale, {
            toValue: 1,
            duration: 2000,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      ])
    );

    // Milk wave animation
    const milkAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(milkWave, {
          toValue: 1,
          duration: 1500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(milkWave, {
          toValue: 0,
          duration: 1500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    // Bubbles floating animation
    const bubbleAnimations = bubbles.map((bubble, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * 400),
          Animated.timing(bubble, {
            toValue: 1,
            duration: 2500 + index * 300,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(bubble, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ])
      )
    );

    catAnimation.start();
    milkAnimation.start();
    bubbleAnimations.forEach(anim => anim.start());

    // Hide loading screen after 3 seconds with fade out
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

    return () => {
      clearTimeout(timer);
      catAnimation.stop();
      milkAnimation.stop();
      bubbleAnimations.forEach(anim => anim.stop());
    };
  }, [catSway, milkWave, bubbles, opacity, catScale, onFinish]);

  if (!isVisible) {
    return null;
  }

  const catRotation = catSway.interpolate({
    inputRange: [0, 1],
    outputRange: ['-4deg', '4deg'],
  });

  const milkY = milkWave.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -6],
  });

  const bubble1Y = bubbles[0].interpolate({
    inputRange: [0, 1],
    outputRange: [0, -100],
  });

  const bubble2Y = bubbles[1].interpolate({
    inputRange: [0, 1],
    outputRange: [0, -120],
  });

  const bubble3Y = bubbles[2].interpolate({
    inputRange: [0, 1],
    outputRange: [0, -110],
  });

  const bubble1Opacity = bubbles[0].interpolate({
    inputRange: [0, 0.3, 0.7, 1],
    outputRange: [0, 0.7, 0.7, 0],
  });

  const bubble2Opacity = bubbles[1].interpolate({
    inputRange: [0, 0.3, 0.7, 1],
    outputRange: [0, 0.6, 0.6, 0],
  });

  const bubble3Opacity = bubbles[2].interpolate({
    inputRange: [0, 0.3, 0.7, 1],
    outputRange: [0, 0.65, 0.65, 0],
  });

  return (
    <Animated.View style={[styles.container, { opacity }]}>
      <Animated.View
        style={[
          styles.catContainer,
          {
            transform: [
              { rotate: catRotation },
              { scale: catScale },
            ],
          },
        ]}
      >
        {/* Cat Head */}
        <View style={styles.catHead}>
          {/* Ears */}
          <View style={[styles.catEar, styles.catEarLeft]} />
          <View style={[styles.catEar, styles.catEarRight]} />
          
          {/* Eyes */}
          <View style={[styles.catEye, styles.catEyeLeft]}>
            <View style={styles.catEyePupil} />
          </View>
          <View style={[styles.catEye, styles.catEyeRight]}>
            <View style={styles.catEyePupil} />
          </View>
          
          {/* Nose */}
          <View style={styles.catNose} />
          
          {/* Mouth */}
          <View style={styles.catMouth}>
            <View style={styles.catMouthLine} />
          </View>
        </View>

        {/* Cat Body */}
        <View style={styles.catBody} />

        {/* Milk Glass Container */}
        <Animated.View
          style={[
            styles.glassContainer,
            {
              transform: [{ translateY: milkY }],
            },
          ]}
        >
          {/* Glass */}
          <View style={styles.glass}>
            {/* Milk */}
            <Animated.View
              style={[
                styles.milk,
                {
                  transform: [
                    {
                      translateY: milkWave.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, -2],
                      }),
                    },
                  ],
                },
              ]}
            />
            {/* Milk surface */}
            <View style={styles.milkSurface} />
          </View>
        </Animated.View>

        {/* Cat Paws */}
        <View style={[styles.catPaw, styles.catPawLeft]} />
        <View style={[styles.catPaw, styles.catPawRight]} />
      </Animated.View>
      
      {/* Floating bubbles */}
      <Animated.View
        style={[
          styles.bubble,
          styles.bubble1,
          {
            transform: [{ translateY: bubble1Y }],
            opacity: bubble1Opacity,
          },
        ]}
      />
      
      <Animated.View
        style={[
          styles.bubble,
          styles.bubble2,
          {
            transform: [{ translateY: bubble2Y }],
            opacity: bubble2Opacity,
          },
        ]}
      />
      
      <Animated.View
        style={[
          styles.bubble,
          styles.bubble3,
          {
            transform: [{ translateY: bubble3Y }],
            opacity: bubble3Opacity,
          },
        ]}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#080808',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
  },
  catContainer: {
    width: 200,
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catHead: {
    width: 80,
    height: 70,
    backgroundColor: '#2C2C2C',
    borderRadius: 40,
    position: 'relative',
    marginBottom: 10,
  },
  catEar: {
    position: 'absolute',
    width: 0,
    height: 0,
    borderLeftWidth: 12,
    borderRightWidth: 12,
    borderBottomWidth: 20,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#2C2C2C',
    top: -10,
  },
  catEarLeft: {
    left: 15,
  },
  catEarRight: {
    right: 15,
  },
  catEye: {
    position: 'absolute',
    width: 12,
    height: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    top: 20,
  },
  catEyeLeft: {
    left: 20,
  },
  catEyeRight: {
    right: 20,
  },
  catEyePupil: {
    width: 6,
    height: 6,
    backgroundColor: '#2C2C2C',
    borderRadius: 3,
    position: 'absolute',
    top: 3,
    left: 3,
  },
  catNose: {
    position: 'absolute',
    width: 0,
    height: 0,
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderBottomWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#FFB6C1',
    top: 35,
    left: 36,
  },
  catMouth: {
    position: 'absolute',
    top: 42,
    left: 40,
  },
  catMouthLine: {
    width: 20,
    height: 2,
    backgroundColor: '#2C2C2C',
    borderRadius: 1,
  },
  catBody: {
    width: 100,
    height: 80,
    backgroundColor: '#2C2C2C',
    borderRadius: 50,
    marginTop: -10,
  },
  glassContainer: {
    position: 'absolute',
    bottom: 20,
    left: 60,
  },
  glass: {
    width: 50,
    height: 60,
    borderWidth: 2,
    borderColor: '#E0E0E0',
    borderRadius: 4,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    overflow: 'hidden',
    backgroundColor: 'rgba(224, 224, 224, 0.1)',
  },
  milk: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    height: '75%',
    backgroundColor: '#FFFFFF',
  },
  milkSurface: {
    position: 'absolute',
    top: '25%',
    width: '100%',
    height: 2,
    backgroundColor: '#E0E0E0',
    opacity: 0.5,
  },
  catPaw: {
    position: 'absolute',
    width: 20,
    height: 20,
    backgroundColor: '#2C2C2C',
    borderRadius: 10,
    bottom: 10,
  },
  catPawLeft: {
    left: 45,
  },
  catPawRight: {
    right: 45,
  },
  bubble: {
    position: 'absolute',
    borderRadius: 50,
    backgroundColor: 'rgba(224, 224, 224, 0.3)',
  },
  bubble1: {
    width: 16,
    height: 16,
    left: '30%',
    bottom: '30%',
  },
  bubble2: {
    width: 12,
    height: 12,
    left: '60%',
    bottom: '25%',
  },
  bubble3: {
    width: 14,
    height: 14,
    left: '45%',
    bottom: '20%',
  },
});
