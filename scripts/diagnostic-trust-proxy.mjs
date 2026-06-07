import express from 'express'
import http from 'http'

console.log('==================================================')
console.log('      SourceTrack trust proxy Diagnostic')
console.log('==================================================')
console.log('NOTE: This script performs local simulations to check how')
console.log('Express parses X-Forwarded-For chains. It does not prove')
console.log('actual production Railway edge behavior on its own, but')
console.log('verifies the library logic under simulated scenarios.\n')

const PORT_UNTRUSTED = 3005
const PORT_TRUSTED = 3006

// Helper to make requests
async function makeRequest(port, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port: port,
      path: '/test',
      method: 'GET',
      headers: headers
    }

    const req = http.request(options, (res) => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        resolve(JSON.parse(data))
      })
    })

    req.on('error', reject)
    req.end()
  })
}

async function runDiagnostics() {
  // 1. Setup Untrusted Server (trust proxy = false)
  const appUntrusted = express()
  appUntrusted.set('trust proxy', false)
  appUntrusted.get('/test', (req, res) => {
    res.json({
      ip: req.ip,
      ips: req.ips,
      raw_xff: req.headers['x-forwarded-for'] || null,
      remote_address: req.socket.remoteAddress
    })
  })
  const serverUntrusted = appUntrusted.listen(PORT_UNTRUSTED)

  // 2. Setup Trusted Server (trust proxy = 1)
  const appTrusted = express()
  appTrusted.set('trust proxy', 1)
  appTrusted.get('/test', (req, res) => {
    res.json({
      ip: req.ip,
      ips: req.ips,
      raw_xff: req.headers['x-forwarded-for'] || null,
      remote_address: req.socket.remoteAddress
    })
  })
  const serverTrusted = appTrusted.listen(PORT_TRUSTED)

  // Wait a moment for servers to start
  await new Promise(r => setTimeout(r, 500))

  console.log('--- Case A: Direct Connection (No Spoofing) ---')
  console.log('Client directly calls API server without passing X-Forwarded-For.')
  const aUntrusted = await makeRequest(PORT_UNTRUSTED)
  const aTrusted = await makeRequest(PORT_TRUSTED)
  console.log(`[trust proxy = false] -> resolved IP: ${aUntrusted.ip} | socket: ${aUntrusted.remote_address}`)
  console.log(`[trust proxy = 1]     -> resolved IP: ${aTrusted.ip} | socket: ${aTrusted.remote_address}`)

  console.log('\n--- Case B: Direct Connection with Spoofed XFF ---')
  console.log('Client directly calls API server and passes fake "X-Forwarded-For: 9.9.9.9".')
  const bUntrusted = await makeRequest(PORT_UNTRUSTED, { 'X-Forwarded-For': '9.9.9.9' })
  const bTrusted = await makeRequest(PORT_TRUSTED, { 'X-Forwarded-For': '9.9.9.9' })
  console.log(`[trust proxy = false] -> resolved IP: ${bUntrusted.ip} | raw XFF: ${bUntrusted.raw_xff} | socket: ${bUntrusted.remote_address}`)
  console.log(`[trust proxy = 1]     -> resolved IP: ${bTrusted.ip} | raw XFF: ${bTrusted.raw_xff} | socket: ${bTrusted.remote_address}`)

  console.log('\n--- Case C: Appended Proxy Chain (Railway Mimic) ---')
  console.log('Railway Edge receives request from client (127.0.0.1) and appends it to XFF.')
  // Chain: X-Forwarded-For: client_ip
  const cUntrusted = await makeRequest(PORT_UNTRUSTED, { 'X-Forwarded-For': '127.0.0.1' })
  const cTrusted = await makeRequest(PORT_TRUSTED, { 'X-Forwarded-For': '127.0.0.1' })
  console.log(`[trust proxy = false] -> resolved IP: ${cUntrusted.ip} | raw XFF: ${cUntrusted.raw_xff} | socket: ${cUntrusted.remote_address}`)
  console.log(`[trust proxy = 1]     -> resolved IP: ${cTrusted.ip} | raw XFF: ${cTrusted.raw_xff} | socket: ${cTrusted.remote_address}`)

  console.log('\n--- Case D: Spoofed Chain Appended (Railway Mimic with Client Spoof) ---')
  console.log('Client sends "X-Forwarded-For: 9.9.9.9". Railway Edge appends the client IP (127.0.0.1) resulting in: "9.9.9.9, 127.0.0.1".')
  // Chain: X-Forwarded-For: client_spoof_ip, real_client_ip
  const dUntrusted = await makeRequest(PORT_UNTRUSTED, { 'X-Forwarded-For': '9.9.9.9, 127.0.0.1' })
  const dTrusted = await makeRequest(PORT_TRUSTED, { 'X-Forwarded-For': '9.9.9.9, 127.0.0.1' })
  console.log(`[trust proxy = false] -> resolved IP: ${dUntrusted.ip} | raw XFF: ${dUntrusted.raw_xff} | socket: ${dUntrusted.remote_address}`)
  console.log(`[trust proxy = 1]     -> resolved IP: ${dTrusted.ip} | raw XFF: ${dTrusted.raw_xff} | socket: ${dTrusted.remote_address}`)

  console.log('\n--- Summary and Analysis ---')
  if (bTrusted.ip === '9.9.9.9') {
    console.log('⚠️  WARNING: Under "trust proxy = 1", a direct client sending a fake XFF header successfully spoofed the resolved IP to "9.9.9.9".')
    console.log('   This happens because "trust proxy = 1" trusts the first hop (the client itself, since there is no intermediate proxy).')
  } else {
    console.log('✅ Under "trust proxy = 1", direct client spoofing did not affect the resolved IP.')
  }

  if (dTrusted.ip === '127.0.0.1') {
    console.log('✅ Under "trust proxy = 1" with Railway Edge appending, the client IP resolved correctly to the real client IP (127.0.0.1).')
    console.log('   The client-spoofed leftmost IP (9.9.9.9) was ignored.')
  } else {
    console.log('⚠️  WARNING: The real client IP was not correctly resolved under "trust proxy = 1" in Case D.')
  }

  // Clean up
  serverUntrusted.close()
  serverTrusted.close()
}

runDiagnostics()
