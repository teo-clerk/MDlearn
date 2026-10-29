// A server that never says it is ready.
process.stdin.on('end', () => process.exit(0))
process.stdin.resume()
