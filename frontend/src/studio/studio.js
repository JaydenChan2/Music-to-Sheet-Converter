import { createContext, useContext } from 'react';

export const STAGES = [
  { id: 'queued', label: 'Queued', detail: 'Waiting in queue' },
  { id: 'downloading', label: 'Download', detail: 'Downloading audio from link' },
  { id: 'decoding', label: 'Decode', detail: 'Decoding audio' },
  { id: 'listening', label: 'Listen', detail: 'Listening to the teacher', tutorialOnly: true },
  { id: 'separating', label: 'Isolate', detail: 'Isolating the guitar from the mix' },
  { id: 'transcribing', label: 'Detect', detail: 'Detecting notes and chords' },
  { id: 'arranging', label: 'Arrange', detail: 'Finding the beat and choosing fingerings' },
  { id: 'rendering', label: 'Render', detail: 'Writing tab and MIDI' },
];

export const StudioContext = createContext(null);

export const useStudio = () => useContext(StudioContext);
