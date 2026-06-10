import dgram from 'dgram';
import { networkInterfaces } from 'os';

interface ServiceInfo {
  serviceName: string;
  port: number;
  host: string;
  sessionId: string;
}

export class LANDiscovery {
  private socket: dgram.Socket | null = null;
  private port: number;
  private broadcastInterval: ReturnType<typeof setInterval> | null = null;
  private discoveredServices: Map<string, ServiceInfo> = new Map();

  constructor(port: number) {
    this.port = port;
  }

  async startBroadcasting(serviceInfo: ServiceInfo): Promise<void> {
    this.socket = dgram.createSocket('udp4');

    const message = Buffer.from(JSON.stringify({
      type: 'trpgmaster:announce',
      ...serviceInfo,
    }));

    this.socket.bind(() => {
      if (this.socket) {
        this.socket.setBroadcast(true);

        this.broadcastInterval = setInterval(() => {
          const broadcastAddr = this.getBroadcastAddress();
          this.socket?.send(message, this.port, broadcastAddr, (err) => {
            if (err) console.error('Broadcast error:', err);
          });
        }, 3000);
      }
    });
  }

  async startListening(): Promise<void> {
    this.socket = dgram.createSocket('udp4');

    this.socket.on('message', (msg, rinfo) => {
      try {
        const data = JSON.parse(msg.toString());
        if (data.type === 'trpgmaster:announce') {
          const service: ServiceInfo = {
            serviceName: data.serviceName,
            port: data.port,
            host: rinfo.address,
            sessionId: data.sessionId,
          };
          this.discoveredServices.set(service.sessionId, service);
        }
      } catch {
        // Ignore non-JSON messages
      }
    });

    this.socket.bind(this.port);
  }

  stop(): void {
    if (this.broadcastInterval) {
      clearInterval(this.broadcastInterval);
    }
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.discoveredServices.clear();
  }

  getDiscoveredServices(): ServiceInfo[] {
    return Array.from(this.discoveredServices.values());
  }

  private getBroadcastAddress(): string {
    const interfaces = networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name] || []) {
        // Skip internal and non-IPv4
        if (iface.internal || iface.family !== 'IPv4') continue;

        // Calculate broadcast address
        const parts = iface.address.split('.');
        const maskParts = iface.netmask.split('.');
        const broadcast = parts.map((p, i) => {
          return (parseInt(p) | (~parseInt(maskParts[i]) & 255)).toString();
        });
        return broadcast.join('.');
      }
    }
    return '255.255.255.255';
  }
}