import React from 'react';
import dynamic from 'next/dynamic';

const NdaReviewer = dynamic(() => import('../src/features/nda/NdaReviewer'), { ssr: false });

export default function NdaPage() {
  return <NdaReviewer />;
}
