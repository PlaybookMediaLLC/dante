'use client';

import * as React from 'react';
import { useImageStore } from '@/lib/store';
import { useShallow } from 'zustand/react/shallow';
import { Slider } from '@/components/ui/slider';

export function BackgroundEffects() {
  const {
    backgroundBlur,
    backgroundNoise,
    setBackgroundBlur,
    setBackgroundNoise,
  } = useImageStore(
    useShallow((state) => ({
      backgroundBlur: state.backgroundBlur,
      backgroundNoise: state.backgroundNoise,
      setBackgroundBlur: state.setBackgroundBlur,
      setBackgroundNoise: state.setBackgroundNoise,
    }))
  );

  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold text-foreground uppercase tracking-wide">Background Effects</h4>
      <div className="space-y-2">
        <Slider
          value={[backgroundBlur]}
          onValueChange={(value) => setBackgroundBlur(value[0])}
          min={0}
          max={50}
          step={1}
          label="Blur"
          valueDisplay={`${backgroundBlur}px`}
        />
        <Slider
          value={[backgroundNoise]}
          onValueChange={(value) => setBackgroundNoise(value[0])}
          min={0}
          max={100}
          step={1}
          label="Noise"
          valueDisplay={`${backgroundNoise}%`}
        />
      </div>
    </div>
  );
}
