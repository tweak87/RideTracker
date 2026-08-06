import SwiftUI

struct RTDeviceChannel: Identifiable, Codable, Hashable {
    var id: String
    var metric: String
    var unit: String
    var enabled: Bool
    var sampleRateHz: Double
    var calibratedAt: Date?
}

struct RTDeviceDescriptor: Identifiable, Codable, Hashable {
    var id: String
    var name: String
    var type: String
    var transport: String
    var enabled: Bool
    var autoReconnect: Bool
    var channels: [RTDeviceChannel]
}

@MainActor
final class DeviceRegistryStore: ObservableObject {
    @Published var devices: [RTDeviceDescriptor] { didSet { save() } }
    private let key = "rideTracker.devices.v1"
    init() {
        if let data = UserDefaults.standard.data(forKey: key), let value = try? JSONDecoder().decode([RTDeviceDescriptor].self, from: data) { devices = value }
        else { devices = Self.defaults }
    }
    func save() { if let data = try? JSONEncoder().encode(devices) { UserDefaults.standard.set(data, forKey: key) } }
    func addCustom() { devices.append(.init(id: UUID().uuidString, name: "Neues Gerät", type: "custom", transport: "bluetooth-le", enabled: false, autoReconnect: true, channels: [.init(id: "value", metric: "customValue", unit: "", enabled: true, sampleRateHz: 1)])) }
    static let defaults: [RTDeviceDescriptor] = [
        .init(id:"phone-motion",name:"iPhone Bewegung",type:"phone",transport:"internal",enabled:true,autoReconnect:true,channels:[.init(id:"motion",metric:"gForce",unit:"g",enabled:true,sampleRateHz:100)]),
        .init(id:"phone-gps",name:"iPhone GPS",type:"gnss",transport:"internal",enabled:true,autoReconnect:true,channels:[.init(id:"location",metric:"location",unit:"deg",enabled:true,sampleRateHz:1),.init(id:"speed",metric:"speedKmh",unit:"km/h",enabled:true,sampleRateHz:1)]),
        .init(id:"phone-camera",name:"iPhone Kamera",type:"camera",transport:"internal",enabled:true,autoReconnect:true,channels:[.init(id:"video",metric:"video",unit:"stream",enabled:true,sampleRateHz:30)]),
        .init(id:"ble-heart",name:"BLE Herzfrequenz",type:"heartRate",transport:"bluetooth-le",enabled:false,autoReconnect:true,channels:[.init(id:"heartRate",metric:"heartRateBpm",unit:"bpm",enabled:true,sampleRateHz:1)]),
        .init(id:"external-imu",name:"Externe IMU",type:"imu",transport:"bluetooth-le",enabled:false,autoReconnect:true,channels:[.init(id:"acceleration",metric:"acceleration",unit:"m/s²",enabled:true,sampleRateHz:200),.init(id:"gyroscope",metric:"gyroscope",unit:"rad/s",enabled:true,sampleRateHz:200)]),
        .init(id:"external-gnss",name:"Externer GNSS-Empfänger",type:"gnss",transport:"bluetooth-le",enabled:false,autoReconnect:true,channels:[.init(id:"position",metric:"location",unit:"deg",enabled:true,sampleRateHz:10)]),
        .init(id:"external-camera",name:"Externe Kamera",type:"camera",transport:"wifi",enabled:false,autoReconnect:true,channels:[.init(id:"video",metric:"video",unit:"stream",enabled:true,sampleRateHz:30)])
    ]
}

struct DeviceCenterView: View {
    @StateObject private var store = DeviceRegistryStore()
    var body: some View {
        NavigationStack {
            List {
                ForEach($store.devices) { $device in
                    NavigationLink {
                        DeviceDetailView(device: $device)
                    } label: {
                        VStack(alignment: .leading) {
                            Text(device.name).font(.headline)
                            Text("\(device.transport) · \(device.channels.count) Kanäle").font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            }
            .navigationTitle("Geräte & Sensoren")
            .toolbar { Button(action: store.addCustom) { Image(systemName: "plus") } }
        }
    }
}

private struct DeviceDetailView: View {
    @Binding var device: RTDeviceDescriptor
    var body: some View {
        Form {
            Section("Gerät") {
                TextField("Name", text: $device.name)
                Toggle("Aktiv", isOn: $device.enabled)
                Toggle("Automatisch verbinden", isOn: $device.autoReconnect)
                LabeledContent("Typ", value: device.type)
                LabeledContent("Transport", value: device.transport)
            }
            ForEach($device.channels) { $channel in
                Section(channel.metric) {
                    Toggle("Kanal aktiv", isOn: $channel.enabled)
                    HStack { Text("Messrate"); Spacer(); TextField("Hz", value: $channel.sampleRateHz, format: .number).keyboardType(.decimalPad).multilineTextAlignment(.trailing); Text("Hz") }
                    LabeledContent("Einheit", value: channel.unit)
                    Button(channel.calibratedAt == nil ? "Separat kalibrieren" : "Neu kalibrieren") { channel.calibratedAt = Date() }
                    if let date = channel.calibratedAt { Text("Kalibriert: \(date.formatted())").font(.caption).foregroundStyle(.secondary) }
                }
            }
        }.navigationTitle(device.name)
    }
}
