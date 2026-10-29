// Stands in for server/start.mjs: prints the ready line, then waits until stdin closes.
process.stdout.write(`noise\nMDLEARN_READY wrong-token http://localhost:1/\nMDLEARN_READY ${process.env.MDLEARN_READY_TOKEN} http://localhost:${process.env.MDLEARN_PORT}/\n`)
process.stdin.on('end', () => process.exit(0))
process.stdin.resume()
