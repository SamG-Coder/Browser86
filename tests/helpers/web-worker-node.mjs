// Node-only adapter for the worker message protocol; not a browser emulation.
import {parentPort,workerData} from 'node:worker_threads';
globalThis.self=globalThis;
globalThis.postMessage=(value,transfer=[])=>parentPort.postMessage(value,transfer);
await import(workerData.module);
parentPort.on('message',data=>self.onmessage({data}));
postMessage({type:'adapter-ready'});
