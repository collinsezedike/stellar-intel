'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import type { FreighterState } from '@/types'

const STORAGE_KEY = 'freighter_connected'
const POLL_MS = 5000
const EARLY_POLL_MS = 2000
const EARLY_POLL_DURATION_MS = 30_000

const INITIAL_STATE: FreighterState = {
  isInstalled: false,
  isConnected: false,
  publicKey: null,
  network: null,
  error: null,
}

export function useFreighter() {
  const [state, setState] = useState<FreighterState>(INITIAL_STATE)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    let earlyIntervalId: ReturnType<typeof setInterval> | null = null
    let earlyTimeoutId: ReturnType<typeof setTimeout> | null = null
    let fallbackIntervalId: ReturnType<typeof setInterval> | null = null
    const watcherHandle = { current: null as { stop: () => void } | null }

    function onVisibilityDetect() {
      if (!cancelled) void detect()
    }

    async function detect() {
      try {
        const { isConnected, getAddress, getNetwork } = await import('@stellar/freighter-api')
        const connResult = await isConnected()

        if (cancelled || !mountedRef.current) return

        if (connResult.error || !connResult.isConnected) {
          setState((s) => {
            if (s.isConnected) {
              return { ...s, isInstalled: true, isConnected: false, publicKey: null, network: null }
            }
            return s.isInstalled ? s : { ...s, isInstalled: true }
          })
          return
        }

        const [addrResult, netResult] = await Promise.all([getAddress(), getNetwork()])
        if (cancelled || !mountedRef.current) return

        const networkName = netResult.network ?? null
        const networkError =
          networkName !== 'PUBLIC' ? 'Please switch Freighter to Mainnet' : null
        const addr = addrResult as { address?: string; publicKey?: string }
        const pk = addr.address ?? addr.publicKey ?? null

        setState({
          isInstalled: true,
          isConnected: true,
          publicKey: pk,
          network: networkName,
          error: networkError,
        })
      } catch {
        if (cancelled || !mountedRef.current) return
        setState((s) => (s.isInstalled ? { ...s, isInstalled: false } : s))
      }
    }

    async function init() {
      await detect()

      // Phase 1: poll every 2s for first 30s to catch mid-session install
      earlyIntervalId = setInterval(() => { if (!cancelled) void detect() }, EARLY_POLL_MS)

      earlyTimeoutId = setTimeout(() => {
        if (earlyIntervalId) { clearInterval(earlyIntervalId); earlyIntervalId = null }
        // Phase 2: event-driven detection after 30s
        if (!cancelled) {
          window.addEventListener('focus', onVisibilityDetect)
          document.addEventListener('visibilitychange', onVisibilityDetect)
        }
      }, EARLY_POLL_DURATION_MS)

      // Account/network change subscription (independent of install detection)
      try {
        const { WatchWalletChanges } = await import('@stellar/freighter-api')
        if (cancelled) return

        const watcher = new WatchWalletChanges(POLL_MS)
        watcherHandle.current = watcher
        watcher.watch((result: { address?: string; network?: string }) => {
          if (cancelled || !mountedRef.current) return
          const pk = result.address ?? null
          const networkName = result.network ?? null
          const networkError =
            pk && networkName !== 'PUBLIC' ? 'Please switch Freighter to Mainnet' : null

          setState((s) => {
            if (s.publicKey === pk && s.network === networkName && s.error === networkError) return s
            return {
              ...s,
              isInstalled: true,
              isConnected: !!pk,
              publicKey: pk,
              network: networkName,
              error: networkError,
            }
          })
        })
      } catch {
        // WatchWalletChanges unavailable; fall back to 5s polling
        if (!cancelled) fallbackIntervalId = setInterval(detect, POLL_MS)
      }
    }

    init()

    return () => {
      cancelled = true
      if (earlyIntervalId) clearInterval(earlyIntervalId)
      if (earlyTimeoutId) clearTimeout(earlyTimeoutId)
      watcherHandle.current?.stop()
      if (fallbackIntervalId) clearInterval(fallbackIntervalId)
      window.removeEventListener('focus', onVisibilityDetect)
      document.removeEventListener('visibilitychange', onVisibilityDetect)
    }
  }, [])

  const connect = useCallback(async () => {
    setState((s) => ({ ...s, error: null }))
    try {
      const { requestAccess, getAddress, getNetwork } = await import('@stellar/freighter-api')
      const accessResult = await requestAccess()
      if (accessResult.error) throw new Error(String(accessResult.error))

      const [addrResult, netResult] = await Promise.all([getAddress(), getNetwork()])
      if (!mountedRef.current) return

      const networkName = netResult.network ?? null
      const networkError =
        networkName !== 'PUBLIC' ? 'Please switch Freighter to Mainnet' : null
      const addr = addrResult as { address?: string; publicKey?: string }

      try {
        localStorage.setItem(STORAGE_KEY, 'true')
      } catch {
        // SSR / restricted environments
      }

      setState({
        isInstalled: true,
        isConnected: true,
        publicKey: addr.address ?? addr.publicKey ?? null,
        network: networkName,
        error: networkError,
      })
    } catch (err) {
      if (!mountedRef.current) return
      const message =
        err instanceof Error ? err.message : 'Freighter not detected'
      setState((s) => ({ ...s, isConnected: false, publicKey: null, error: message }))
    }
  }, [])

  const disconnect = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // SSR / restricted environments
    }
    setState((s) => ({
      ...s,
      isConnected: false,
      publicKey: null,
      network: null,
      error: null,
    }))
  }, [])

  return { ...state, connect, disconnect }
}
