'use client';
import { useEffect, useState } from 'react';
export default function VideoProcessingStatus({ id }: { id: string }) {
  const [status, setStatus] = useState('queued');
  const [message, setMessage] = useState('');
  useEffect(() => {
    let stopped=false;
    const poll=async()=>{try {const r=await fetch(`/api/video-processing/${id}`,{cache:'no-store'});if(r.ok&&!stopped)setStatus((await r.json()).status);}catch{/* Next poll retries. */}};
    void poll();const timer=setInterval(()=>void poll(),3000);
    return()=>{stopped=true;clearInterval(timer);};
  },[id]);
  return <div role="status" className="mt-2 rounded-lg border border-slate-300 p-3 text-xs text-slate-700">
    {status==='ready'?'Video ready':status==='failed'?'Video could not be prepared.':status==='processing'?'Preparing video…':'Waiting to prepare video…'}
    <p className="mt-1">You can save your draft and return later.</p>
    {(status==='failed'||status==='queued')&&<button type="button" className="mt-2 underline" onClick={async()=>{
      const r=await fetch(`/api/video-processing/${id}`,{method:'POST'});
      if(r.ok){setStatus('queued');setMessage('');}else setMessage('Already running or unavailable. Try again shortly.');
    }}>Retry processing</button>}
    {message&&<p role="alert">{message}</p>}
  </div>;
}
