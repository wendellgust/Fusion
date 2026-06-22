import { FC, useEffect, useRef } from 'react';

import { pluginFactory } from '@nuclearplayer/hifi';

import { useVisualizerStore } from '../stores/visualizerStore';

const analyserPlugin = {
  createNode(ctx: AudioContext): AnalyserNode {
    const node = ctx.createAnalyser();
    node.fftSize = 1024;
    return node;
  },
};

const BaseAnalyser = pluginFactory<Record<string, unknown>, AnalyserNode>(
  analyserPlugin,
);

type VisualizerAnalyserProps = Record<string, unknown> & {
  onRegister?: (node: AnalyserNode) => void;
};

export const VisualizerAnalyser: FC<VisualizerAnalyserProps> = (props) => {
  const setAnalyser = useVisualizerStore((state) => state.setAnalyser);
  const analyserRef = useRef<AnalyserNode | null>(null);

  const handleRegister = (node: AnalyserNode) => {
    analyserRef.current = node;
    setAnalyser(node);
    if (props.onRegister) {
      props.onRegister(node);
    }
  };

  useEffect(() => {
    return () => {
      if (useVisualizerStore.getState().analyser === analyserRef.current) {
        setAnalyser(null);
      }
    };
  }, [setAnalyser]);

  return <BaseAnalyser {...props} onRegister={handleRegister} />;
};
