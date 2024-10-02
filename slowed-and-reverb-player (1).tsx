'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Slider } from "@/components/ui/slider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Play, Pause, Upload, Download, SkipBack, SkipForward } from "lucide-react"

export default function SlowedAndReverbPlayer() {
  const [isPlaying, setIsPlaying] = useState(false)
  const [volume, setVolume] = useState(50)
  const [speed, setSpeed] = useState(1)
  const [reverb, setReverb] = useState(0)
  const [bass, setBass] = useState(0)
  const [currentTrack, setCurrentTrack] = useState("No track selected")
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(0)

  const audioContextRef = useRef<AudioContext | null>(null)
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null)
  const gainNodeRef = useRef<GainNode | null>(null)
  const reverbNodeRef = useRef<ConvolverNode | null>(null)
  const dryGainNodeRef = useRef<GainNode | null>(null)
  const wetGainNodeRef = useRef<GainNode | null>(null)
  const analyserNodeRef = useRef<AnalyserNode | null>(null)
  const bassFilterRef = useRef<BiquadFilterNode | null>(null)
  const audioBufferRef = useRef<AudioBuffer | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const startTimeRef = useRef(0)
  const pausedAtRef = useRef(0)
  const animationFrameRef = useRef<number | null>(null)

  useEffect(() => {
    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
    analyserNodeRef.current = audioContextRef.current.createAnalyser()
    analyserNodeRef.current.fftSize = 256

    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close()
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const updateTime = () => {
      if (audioContextRef.current && startTimeRef.current && isPlaying) {
        const newTime = pausedAtRef.current + audioContextRef.current.currentTime - startTimeRef.current
        if (newTime <= duration) {
          setCurrentTime(newTime)
          animationFrameRef.current = requestAnimationFrame(updateTime)
        } else {
          setIsPlaying(false)
          setCurrentTime(duration)
        }
      }
    }

    if (isPlaying) {
      animationFrameRef.current = requestAnimationFrame(updateTime)
    } else if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [isPlaying, duration])

  const createReverbImpulse = useCallback((duration: number, decay: number, reverse: boolean = false) => {
    const sampleRate = audioContextRef.current!.sampleRate
    const length = sampleRate * duration
    const impulse = audioContextRef.current!.createBuffer(2, length, sampleRate)
    const left = impulse.getChannelData(0)
    const right = impulse.getChannelData(1)

    for (let i = 0; i < length; i++) {
      const n = reverse ? length - i : i
      left[i] = (Math.random() * 2 - 1) * Math.pow(1 - n / length, decay)
      right[i] = (Math.random() * 2 - 1) * Math.pow(1 - n / length, decay)
    }

    return impulse
  }, [])

  const setupAudioNodes = useCallback(() => {
    if (!audioContextRef.current || !audioBufferRef.current) return

    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect()
    }
    if (gainNodeRef.current) {
      gainNodeRef.current.disconnect()
    }
    if (reverbNodeRef.current) {
      reverbNodeRef.current.disconnect()
    }
    if (dryGainNodeRef.current) {
      dryGainNodeRef.current.disconnect()
    }
    if (wetGainNodeRef.current) {
      wetGainNodeRef.current.disconnect()
    }
    if (bassFilterRef.current) {
      bassFilterRef.current.disconnect()
    }

    sourceNodeRef.current = audioContextRef.current.createBufferSource()
    sourceNodeRef.current.buffer = audioBufferRef.current
    sourceNodeRef.current.playbackRate.value = speed

    gainNodeRef.current = audioContextRef.current.createGain()
    gainNodeRef.current.gain.value = volume / 100

    reverbNodeRef.current = audioContextRef.current.createConvolver()
    const reverbImpulse = createReverbImpulse(3, 2)
    reverbNodeRef.current.buffer = reverbImpulse

    dryGainNodeRef.current = audioContextRef.current.createGain()
    wetGainNodeRef.current = audioContextRef.current.createGain()

    bassFilterRef.current = audioContextRef.current.createBiquadFilter()
    bassFilterRef.current.type = 'lowshelf'
    bassFilterRef.current.frequency.value = 200
    bassFilterRef.current.gain.value = bass

    updateReverbMix()

    sourceNodeRef.current.connect(bassFilterRef.current)
    bassFilterRef.current.connect(dryGainNodeRef.current)
    bassFilterRef.current.connect(reverbNodeRef.current)
    reverbNodeRef.current.connect(wetGainNodeRef.current)
    dryGainNodeRef.current.connect(gainNodeRef.current)
    wetGainNodeRef.current.connect(gainNodeRef.current)
    gainNodeRef.current.connect(analyserNodeRef.current!)
    analyserNodeRef.current!.connect(audioContextRef.current.destination)
  }, [speed, volume, bass, createReverbImpulse])

  const updateReverbMix = useCallback(() => {
    if (dryGainNodeRef.current && wetGainNodeRef.current) {
      const reverbAmount = reverb / 100
      dryGainNodeRef.current.gain.setValueAtTime(1 - reverbAmount, audioContextRef.current!.currentTime)
      wetGainNodeRef.current.gain.setValueAtTime(reverbAmount, audioContextRef.current!.currentTime)
    }
  }, [reverb])

  const handleAudioFile = useCallback(async (file: File) => {
    if (file && file.type === "audio/mpeg") {
      setIsLoading(true)
      setError(null)
      setCurrentTrack(file.name)
      try {
        const arrayBuffer = await file.arrayBuffer()
        audioBufferRef.current = await audioContextRef.current!.decodeAudioData(arrayBuffer)
        setDuration(audioBufferRef.current.duration)
        pausedAtRef.current = 0
        setCurrentTime(0)
        setupAudioNodes()
      } catch (err) {
        setError("Failed to load audio file. Please try again.")
      } finally {
        setIsLoading(false)
      }
    } else {
      setError("Please select a valid .mp3 file")
    }
  }, [setupAudioNodes])

  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      handleAudioFile(file)
    }
  }, [handleAudioFile])

  const togglePlayPause = useCallback(() => {
    if (!audioBufferRef.current) {
      setError("Please upload an audio file")
      return
    }

    setError(null)

    if (isPlaying) {
      if (sourceNodeRef.current) {
        sourceNodeRef.current.stop()
        sourceNodeRef.current = null
      }
      pausedAtRef.current += audioContextRef.current!.currentTime - startTimeRef.current
    } else {
      setupAudioNodes()
      sourceNodeRef.current!.start(0, pausedAtRef.current)
      startTimeRef.current = audioContextRef.current!.currentTime
    }
    setIsPlaying(!isPlaying)
  }, [isPlaying, setupAudioNodes])

  const skipBackward = useCallback(() => {
    const newTime = Math.max(0, currentTime - 10)
    pausedAtRef.current = newTime
    setCurrentTime(newTime)
    if (isPlaying) {
      if (sourceNodeRef.current) {
        sourceNodeRef.current.stop()
      }
      setupAudioNodes()
      sourceNodeRef.current!.start(0, pausedAtRef.current)
      startTimeRef.current = audioContextRef.current!.currentTime
    }
  }, [currentTime, isPlaying, setupAudioNodes])

  const skipForward = useCallback(() => {
    const newTime = Math.min(duration, currentTime + 10)
    pausedAtRef.current = newTime
    setCurrentTime(newTime)
    if (isPlaying) {
      if (sourceNodeRef.current) {
        sourceNodeRef.current.stop()
      }
      setupAudioNodes()
      sourceNodeRef.current!.start(0, pausedAtRef.current)
      startTimeRef.current = audioContextRef.current!.currentTime
    }
  }, [currentTime, duration, isPlaying, setupAudioNodes])

  useEffect(() => {
    if (isPlaying && sourceNodeRef.current) {
      sourceNodeRef.current.playbackRate.value = speed
    }
  }, [speed, isPlaying])

  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.setValueAtTime(volume / 100, audioContextRef.current!.currentTime)
    }
  }, [volume])

  useEffect(() => {
    updateReverbMix()
  }, [reverb, updateReverbMix])

  useEffect(() => {
    if (bassFilterRef.current) {
      bassFilterRef.current.gain.setValueAtTime(bass, audioContextRef.current!.currentTime)
    }
  }, [bass])

  const downloadProcessedAudio = useCallback(async () => {
    if (!audioBufferRef.current) {
      setError("No audio loaded to download")
      return
    }

    setIsDownloading(true)
    setDownloadProgress(0)

    try {
      const offlineContext = new OfflineAudioContext(
        audioBufferRef.current.numberOfChannels,
        audioBufferRef.current.length,
        audioBufferRef.current.sampleRate
      )

      const source = offlineContext.createBufferSource()
      source.buffer = audioBufferRef.current
      source.playbackRate.value = speed

      const gain = offlineContext.createGain()
      gain.gain.value = volume / 100

      const reverbNode = offlineContext.createConvolver()
      const reverbImpulse = createReverbImpulse(3, 2)
      reverbNode.buffer = reverbImpulse

      const dryGainNode = offlineContext.createGain()
      const wetGainNode = offlineContext.createGain()

      const reverbAmount = reverb / 100
      dryGainNode.gain.value = 1 - reverbAmount
      wetGainNode.gain.value = reverbAmount

      const bassFilter = offlineContext.createBiquadFilter()
      bassFilter.type = 'lowshelf'
      bassFilter.frequency.value = 200
      bassFilter.gain.value = bass

      source.connect(bassFilter)
      bassFilter.connect(dryGainNode)
      bassFilter.connect(reverbNode)
      reverbNode.connect(wetGainNode)
      dryGainNode.connect(gain)
      wetGainNode.connect(gain)
      gain.connect(offlineContext.destination)

      source.start()

      const renderedBuffer = await offlineContext.startRendering()

      const wavBlob = await new Promise<Blob>((resolve) => {
        const wavDataView = createWaveFileData(renderedBuffer)
        const wavBlob = new Blob([wavDataView], { type: 'audio/wav' })
        resolve(wavBlob)
      })

      const url = URL.createObjectURL(wavBlob)
      const a = document.createElement('a')
      a.style.display = 'none'
      a.href = url
      a.download = `${currentTrack.replace('.mp3', '')}-Slowed_And_Reverb.wav`
      document.body.appendChild(a)
      a.click()
      URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error('Error processing audio:', error)
      setError('Failed to process and download audio')
    } finally {
      setIsDownloading(false)
      setDownloadProgress(100)
    }
  }, [audioBufferRef, speed, volume, reverb, bass, currentTrack, createReverbImpulse])

  const createWaveFileData = useCallback((audioBuffer: AudioBuffer): DataView => {
    const bytesPerSample = 2
    const numberOfChannels = audioBuffer.numberOfChannels
    const sampleRate = audioBuffer.sampleRate
    const samples = audioBuffer.getChannelData(0).length
    const buffer = new ArrayBuffer(44 + samples * numberOfChannels * bytesPerSample)
    const view = new DataView(buffer)

    // Write WAV header
    writeString(view, 0, 'RIFF')
    view.setUint32(4, 36 + samples * numberOfChannels * bytesPerSample, true)
    writeString(view, 8, 'WAVE')
    writeString(view, 12, 'fmt ')
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true)
    view.setUint16(22, numberOfChannels, true)
    view.setUint32(24, sampleRate, true)
    view.setUint32(28, sampleRate * numberOfChannels * bytesPerSample, true)
    view.setUint16(32, numberOfChannels * bytesPerSample, true)
    view.setUint16(34, 8 * bytesPerSample, true)
    writeString(view, 36, 'data')
    view.setUint32(40, samples * numberOfChannels * bytesPerSample, true)

    // Write audio data
    const offset = 44
    for (let i = 0; i < samples; i++) {
      for (let channel = 0; channel < numberOfChannels; channel++) {
        const sample = audioBuffer.getChannelData(channel)[i]
        const sampleIndex = offset + (i * numberOfChannels + channel) * bytesPerSample
        view.setInt16(sampleIndex, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true)
      }
    }

    return view
  }, [])

  const writeString = useCallback((view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i))
    }
  }, [])

  const drawSpectrum = useCallback(() => {
    if (!analyserNodeRef.current || !canvasRef.current) return

    const canvas = canvasRef.current
    const canvasCtx = canvas.getContext('2d')
    if (!canvasCtx) return

    const WIDTH = canvas.width
    const HEIGHT = canvas.height

    const bufferLength = analyserNodeRef.current.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)

    canvasCtx.clearRect(0, 0, WIDTH, HEIGHT)

    function draw() {
      animationFrameRef.current = requestAnimationFrame(draw)

      analyserNodeRef.current!.getByteFrequencyData(dataArray)

      canvasCtx.fillStyle = '#0e0b0e'
      canvasCtx.fillRect(0, 0, WIDTH, HEIGHT)

      const barWidth = (WIDTH / bufferLength) * 2.5
      let barHeight
      let x = 0

      for (let i = 0; i < bufferLength; i++) {
        barHeight = dataArray[i] / 2

        const r = barHeight + (25 * (i / bufferLength))
        const g = 250 * (i / bufferLength)
        const b = 50

        canvasCtx.fillStyle = `rgb(${r},${g},${b})`
        canvasCtx.fillRect(x, HEIGHT - barHeight, barWidth, barHeight)

        x += barWidth + 1
      }
    }

    draw()
  }, [])

  useEffect(() => {
    if (isPlaying) {
      drawSpectrum()
    } else if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }
  }, [isPlaying, drawSpectrum])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#0e0b0e] p-4">
      <div className="w-full max-w-4xl bg-[#0e0b0e] rounded-xl shadow-2xl overflow-hidden relative shadow-black">
        <div className="absolute top-4 left-4 z-10">
          <Button
            size="sm"
            variant="secondary"
            className="bg-white bg-opacity-20 hover:bg-opacity-30 text-white"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="w-4 h-4 mr-2" />
            Import
          </Button>
          <Input
            type="file"
            accept=".mp3,audio/mpeg"
            className="hidden"
            ref={fileInputRef}
            onChange={handleFileChange}
          />
        </div>
        <div className="absolute top-4 right-4 z-10">
          <Button
            size="sm"
            variant="secondary"
            className="bg-[#cc0235] hover:bg-opacity-90 text-white"
            onClick={downloadProcessedAudio}
            disabled={isDownloading || !audioBufferRef.current}
          >
            <Download className="w-4 h-4 mr-2" />
            Download
          </Button>
        </div>
        <canvas ref={canvasRef} width="800" height="300" className="w-full h-80" />
        <div className="p-6 backdrop-blur-md bg-[#0e0b0e] bg-opacity-50">
          <h2 className="text-2xl font-bold mb-4 text-center text-white truncate">
            {currentTrack}
          </h2>
          
          <div className="flex flex-col space-y-4 mb-6">
            <div className="flex items-center justify-between">
              <Label htmlFor="volume-slider" className="w-16 text-sm text-white">Volume</Label>
              <Slider
                id="volume-slider"
                className="flex-grow mx-2 [&_[role=slider]]:bg-white [&_[role=slider]]:border-white [&_[role=slider]]:shadow-md [&_[role=slider]]:focus:ring-white [&_[role=slider]]:focus:ring-offset-2 [&>[role=slider]]:focus:ring-offset-black [&_.bg-primary]:bg-[#cc0235]"
                value={[volume]}
                onValueChange={(value) => setVolume(value[0])}
                max={100}
                step={1}
              />
              <span className="w-8 text-right text-sm text-white">{volume}%</span>
            </div>
            
            <div className="flex items-center justify-between">
              <Label htmlFor="speed-slider" className="w-16 text-sm text-white">Speed</Label>
              <Slider
                id="speed-slider"
                className="flex-grow mx-2 [&_[role=slider]]:bg-white [&_[role=slider]]:border-white [&_[role=slider]]:shadow-md [&_[role=slider]]:focus:ring-white [&_[role=slider]]:focus:ring-offset-2 [&>[role=slider]]:focus:ring-offset-black [&_.bg-primary]:bg-[#cc0235]"
                value={[speed]}
                onValueChange={(value) => setSpeed(Number((value[0]).toFixed(2)))}
                min={0.5}
                max={1.5}
                step={0.05}
              />
              <span className="w-12 text-right text-sm text-white">{speed.toFixed(2)}x</span>
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="reverb-slider" className="w-16 text-sm text-white">Reverb</Label>
              <Slider
                id="reverb-slider"
                className="flex-grow mx-2 [&_[role=slider]]:bg-white [&_[role=slider]]:border-white [&_[role=slider]]:shadow-md [&_[role=slider]]:focus:ring-white [&_[role=slider]]:focus:ring-offset-2 [&>[role=slider]]:focus:ring-offset-black [&_.bg-primary]:bg-[#cc0235]"
                value={[reverb]}
                onValueChange={(value) => setReverb(value[0])}
                max={100}
                step={1}
              />
              <span className="w-8 text-right text-sm text-white">{reverb}%</span>
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="bass-slider" className="w-16 text-sm text-white">Bass</Label>
              <Slider
                id="bass-slider"
                className="flex-grow mx-2 [&_[role=slider]]:bg-white [&_[role=slider]]:border-white [&_[role=slider]]:shadow-md [&_[role=slider]]:focus:ring-white [&_[role=slider]]:focus:ring-offset-2 [&>[role=slider]]:focus:ring-offset-black [&_.bg-primary]:bg-[#cc0235]"
                value={[bass]}
                onValueChange={(value) => setBass(value[0])}
                min={-10}
                max={10}
                step={1}
              />
              <span className="w-8 text-right text-sm text-white">{bass > 0 ? `+${bass}` : bass}</span>
            </div>
          </div>
          
          <div className="flex justify-center items-center space-x-4 mb-6">
            <Button 
              size="icon"
              variant="secondary"
              className="bg-white bg-opacity-20 hover:bg-opacity-30 text-white"
              onClick={skipBackward}
            >
              <SkipBack className="w-6 h-6" />
            </Button>
            <Button 
              size="lg"
              className="bg-white bg-opacity-20 hover:bg-opacity-30 text-white px-8"
              onClick={togglePlayPause}
            >
              {isPlaying ? <Pause className="w-8 h-8" /> : <Play className="w-8 h-8" />}
            </Button>
            <Button 
              size="icon"
              variant="secondary"
              className="bg-white bg-opacity-20 hover:bg-opacity-30 text-white"
              onClick={skipForward}
            >
              <SkipForward className="w-6 h-6" />
            </Button>
          </div>
        </div>
      </div>
      {isLoading && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="loader"></div>
        </div>
      )}
      {error && (
        <div className="fixed inset-0 flex items-center justify-center z-50">
          <div className="bg-red-600 text-white p-4 rounded-lg shadow-lg max-w-sm w-full mx-4">
            <h3 className="text-lg font-semibold mb-2">Error</h3>
            <p className="mb-4">{error}</p>
            <Button 
              className="w-full bg-white text-red-600 hover:bg-gray-100"
              onClick={() => setError(null)}
            >
              OK
            </Button>
          </div>
        </div>
      )}
      <style jsx>{`
        .loader {
          width: 100px;
          aspect-ratio: 1;
          display: grid;
        }
        .loader::before,
        .loader::after {    
          content:"";
          grid-area: 1/1;
          --c:no-repeat radial-gradient(farthest-side,#25b09b 92%,#0000);
          background: 
            var(--c) 50%  0, 
            var(--c) 50%  100%, 
            var(--c) 100% 50%, 
            var(--c) 0    50%;
          background-size: 24px 24px;
          animation: l12 1s infinite;
        }
        .loader::before {
          margin: 8px;
          filter: hue-rotate(45deg);
          background-size: 16px 16px;
          animation-timing-function: linear
        }
        @keyframes l12 { 
          100%{transform: rotate(.5turn)}
        }
      `}</style>
    </div>
  )
}