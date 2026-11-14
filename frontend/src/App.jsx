import React from 'react';
import { Route, Routes } from 'react-router-dom';
import { StudioProvider } from './studio/StudioContext';
import Layout from './components/site/Layout';
import Home from './pages/Home';
import Studio from './pages/Studio';
import Features from './pages/Features';
import HowItWorks from './pages/HowItWorks';
import Accuracy from './pages/Accuracy';
import NotFound from './pages/NotFound';

export default function App() {
  return (
    <StudioProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="studio" element={<Studio />} />
          <Route path="features" element={<Features />} />
          <Route path="how-it-works" element={<HowItWorks />} />
          <Route path="accuracy" element={<Accuracy />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </StudioProvider>
  );
}
