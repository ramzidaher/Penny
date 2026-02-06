import React, { useEffect, useRef, useState } from 'react';
import { Text, Vibration } from 'react-native';
import { formatCurrencySync } from '../utils/currency';

type SlotMachineBalanceProps = {
  value: number;
  currencyCode: string;
  style?: any;
  /** When true, animate from current value to target (slot-style count-up). When false, show value as plain text. */
  animate?: boolean;
  /** Increment this (e.g. on pull-to-refresh) to re-run the slot animation from 0 and trigger vibration. */
  animationTrigger?: number;
};

const DURATION_MS = 600;
const EASE_OUT_CUBIC = (t: number) => 1 - Math.pow(1 - t, 3);
const VIBRATION_MS = 40;

/**
 * Displays a balance with a slot-machine style: the number counts up from 0 (or
 * previous value) to the target over a short duration. Renders as a single Text.
 * When animationTrigger changes, re-runs the animation from 0 and vibrates.
 */
export default function SlotMachineBalance({
  value,
  currencyCode,
  style,
  animate = true,
  animationTrigger = 0,
}: SlotMachineBalanceProps) {
  const [displayValue, setDisplayValue] = useState(value);
  const displayRef = useRef(value);
  const frameRef = useRef<number>();
  const prevTriggerRef = useRef(animationTrigger);

  useEffect(() => {
    const target = value;
    const triggerChanged = animationTrigger !== prevTriggerRef.current;
    prevTriggerRef.current = animationTrigger;

    if (triggerChanged) {
      displayRef.current = 0;
      setDisplayValue(0);
      try {
        Vibration.vibrate(VIBRATION_MS);
      } catch (_) {}
    }

    const startValue = displayRef.current;
    const startTime = Date.now();

    const tick = () => {
      const elapsed = Date.now() - startTime;
      const t = Math.min(1, elapsed / DURATION_MS);
      const eased = EASE_OUT_CUBIC(t);
      const current = startValue + (target - startValue) * eased;
      displayRef.current = current;
      setDisplayValue(current);
      if (t < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        displayRef.current = target;
        setDisplayValue(target);
      }
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
    };
  }, [value, animationTrigger]);

  if (!animate) {
    return <Text style={style}>{formatCurrencySync(value, currencyCode)}</Text>;
  }

  const formatted = formatCurrencySync(displayValue, currencyCode);
  return <Text style={style}>{formatted}</Text>;
}
