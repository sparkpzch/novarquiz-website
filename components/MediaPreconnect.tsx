'use client';

import ReactDOM from 'react-dom';

// Quiz media (video, cover images) is served straight from Cloud Storage, a
// different origin than the app. Safari serializes a range-probe request before
// it starts fetching video bytes, so the DNS + TLS handshake lands on the
// critical path twice. Warming the connection at mount buys back a round trip.
//
// No crossOrigin: <video>/<img> here are no-CORS requests, and a CORS
// preconnect would warm a connection pool entry they never use.
export default function MediaPreconnect() {
  ReactDOM.preconnect('https://storage.googleapis.com');
  ReactDOM.preconnect('https://firebasestorage.googleapis.com');
  return null;
}
