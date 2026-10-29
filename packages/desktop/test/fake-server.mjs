// Stands in for server/start.mjs: prints the ready line, then waits until stdin closes.
process.stdout.write(`noise\nMDLEARN_READY http://localhost:${process.env.MDLEARN_PORT}/\n`)
process.stdin.on('end', () => process.exit(0))
process.stdin.resume()
