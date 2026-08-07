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

struct RTMetricBinding: Identifiable, Codable, Hashable {
    var metric: String
    var primarySource: String
    var fallbackSources: [String]
    var minimumQuality: Double
    var maxAgeMs: Int
    var interpolation: String
    var widgetId: String?
    var id: String { metric }
}

@MainActor
final class DeviceRegistryStore: ObservableObject {
    @Published var devices: [RTDeviceDescriptor] { didSet { saveDevices() } }
    @Published var bindings: [RTMetricBinding] { didSet { saveBindings() } }
    private let deviceKey = "rideTracker.devices.v1"
    private let bindingKey = "rideTracker.metricBindings.v1"

    init() {
        if let data = UserDefaults.standard.data(forKey: deviceKey), let value = try? JSONDecoder().decode([RTDeviceDescriptor].self, from: data) { devices = value } else { devices = Self.defaults }
        if let data = UserDefaults.standard.data(forKey: bindingKey), let value = try? JSONDecoder().decode([RTMetricBinding].self, from: data) { bindings = value } else { bindings = Self.defaultBindings }
    }

    func saveDevices() { if let data = try? JSONEncoder().encode(devices) { UserDefaults.standard.set(data, forKey: deviceKey) } }
    func saveBindings() { if let data = try? JSONEncoder().encode(bindings) { UserDefaults.standard.set(data, forKey: bindingKey) } }
    func addCustom() { devices.append(.init(id: UUID().uuidString, name: "Neues Gerät", type: "custom", transport: "bluetooth-le", enabled: false, autoReconnect: true, channels: [.init(id: "value", metric: "customValue", unit: "", enabled: true, sampleRateHz: 1)])) }
    func sources(for metric: String) -> [String] { devices.flatMap { device in device.channels.compactMap { channel in let matches = channel.metric == metric || (metric == "gForce" && channel.metric == "acceleration"); return matches ? "\(device.id)/\(channel.id)" : nil } } }

    static let defaults: [RTDeviceDescriptor] = [
        .init(id:"phone-motion",name:"iPhone Bewegung",type:"phone",transport:"internal",enabled:true,autoReconnect:true,channels:[.init(id:"motion",metric:"gForce",unit:"g",enabled:true,sampleRateHz:100)]),
        .init(id:"phone-gps",name:"iPhone GPS",type:"gnss",transport:"internal",enabled:true,autoReconnect:true,channels:[.init(id:"location",metric:"location",unit:"deg",enabled:true,sampleRateHz:1),.init(id:"speed",metric:"speedKmh",unit:"km/h",enabled:true,sampleRateHz:1)]),
        .init(id:"phone-camera",name:"iPhone Kamera",type:"camera",transport:"internal",enabled:true,autoReconnect:true,channels:[.init(id:"video",metric:"video",unit:"stream",enabled:true,sampleRateHz:30)]),
        .init(id:"ble-heart",name:"BLE Herzfrequenz",type:"heartRate",transport:"bluetooth-le",enabled:false,autoReconnect:true,channels:[.init(id:"heartRate",metric:"heartRateBpm",unit:"bpm",enabled:true,sampleRateHz:1)]),
        .init(id:"external-imu",name:"Externe IMU",type:"imu",transport:"bluetooth-le",enabled:false,autoReconnect:true,channels:[.init(id:"acceleration",metric:"acceleration",unit:"m/s²",enabled:true,sampleRateHz:200),.init(id:"gyroscope",metric:"gyroscope",unit:"rad/s",enabled:true,sampleRateHz:200)]),
        .init(id:"external-gnss",name:"Externer GNSS-Empfänger",type:"gnss",transport:"bluetooth-le",enabled:false,autoReconnect:true,channels:[.init(id:"position",metric:"location",unit:"deg",enabled:true,sampleRateHz:10),.init(id:"speed",metric:"speedKmh",unit:"km/h",enabled:true,sampleRateHz:10)]),
        .init(id:"external-camera",name:"Externe Kamera",type:"camera",transport:"wifi",enabled:false,autoReconnect:true,channels:[.init(id:"video",metric:"video",unit:"stream",enabled:true,sampleRateHz:30)])
    ]

    static let defaultBindings: [RTMetricBinding] = [
        .init(metric:"heartRateBpm",primarySource:"ble-heart/heartRate",fallbackSources:[],minimumQuality:0.7,maxAgeMs:3000,interpolation:"hold",widgetId:"pulse"),
        .init(metric:"speedKmh",primarySource:"external-gnss/speed",fallbackSources:["phone-gps/speed"],minimumQuality:0.65,maxAgeMs:1500,interpolation:"linear",widgetId:"speed"),
        .init(metric:"gForce",primarySource:"external-imu/acceleration",fallbackSources:["phone-motion/motion"],minimumQuality:0.7,maxAgeMs:250,interpolation:"hold",widgetId:"gDial"),
        .init(metric:"location",primarySource:"external-gnss/position",fallbackSources:["phone-gps/location"],minimumQuality:0.6,maxAgeMs:3000,interpolation:"linear",widgetId:nil),
        .init(metric:"video",primarySource:"phone-camera/video",fallbackSources:["external-camera/video"],minimumQuality:0.5,maxAgeMs:1000,interpolation:"hold",widgetId:nil)
    ]
}

struct DeviceCenterView: View {
    @StateObject private var store = DeviceRegistryStore()
    @StateObject private var accessory = BLEAccessoryManager()
    @State private var showConnector = false

    var body: some View {
        NavigationStack {
            List {
                Section("Verbindungen") {
                    LabeledContent("BLE", value: accessory.state.rawValue)
                    if let name = accessory.connectedName { LabeledContent("Gerät", value: name) }
                    if let bpm = accessory.latestHeartRate { LabeledContent("Puls", value: "\(bpm) BPM") }
                    Button("Externen Sensor verbinden") { showConnector = true }
                }
                Section { NavigationLink("Quellen & Prioritäten") { SourceRoutingView(store: store) } }
                Section("Geräte") {
                    ForEach($store.devices) { $device in
                        NavigationLink { DeviceDetailView(device: $device) } label: {
                            VStack(alignment: .leading) {
                                Text(device.name).font(.headline)
                                Text("\(device.transport) · \(device.channels.count) Kanäle").font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
            .navigationTitle("Geräte & Sensoren")
            .toolbar { Button(action: store.addCustom) { Image(systemName: "plus") } }
            .sheet(isPresented: $showConnector) { ExternalSensorConnectionSheet(accessory: accessory) }
        }
    }
}

private struct ExternalSensorConnectionSheet: View {
    @ObservedObject var accessory: BLEAccessoryManager
    @Environment(\.dismiss) private var dismiss
    @State private var mode = 0

    var body: some View {
        NavigationStack {
            List {
                Section("Sensortyp") {
                    Picker("Profil", selection: $mode) {
                        Text("Pulsmesser / Uhr").tag(0)
                        Text("RideTracker IMU / GNSS").tag(1)
                    }.pickerStyle(.segmented)
                    Text(mode == 0 ? "Sucht Standard-BLE-Herzfrequenzsensoren. Uhren müssen den Herzfrequenz-Broadcast unterstützen." : "Sucht das RideTracker-Telemetrieprofil für externe IMU-/GNSS-Sensoren.")
                        .font(.caption).foregroundStyle(.secondary)
                    Button("Sensoren suchen") { mode == 0 ? accessory.scanHeartRate() : accessory.scan() }
                }
                Section("Gefundene Geräte") {
                    if accessory.discoveredNames.isEmpty { Text(accessory.state == .scanning ? "Suche läuft …" : "Noch keine Geräte gefunden").foregroundStyle(.secondary) }
                    ForEach(accessory.discoveredNames, id: \.self) { name in
                        HStack {
                            Text(name)
                            Spacer()
                            Button("Verbinden") { accessory.connect(named: name) }.buttonStyle(.borderedProminent)
                        }
                    }
                }
                Section("Status") {
                    LabeledContent("Bluetooth", value: accessory.state.rawValue)
                    if let connectedName = accessory.connectedName { LabeledContent("Verbunden", value: connectedName) }
                    if let bpm = accessory.latestHeartRate { LabeledContent("Puls", value: "\(bpm) BPM") }
                }
            }
            .navigationTitle("Sensor verbinden")
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Fertig") { accessory.stopScan(); dismiss() } } }
        }
    }
}

private struct SourceRoutingView: View {
    @ObservedObject var store: DeviceRegistryStore
    var body: some View {
        Form {
            ForEach($store.bindings) { $binding in
                Section(binding.metric) {
                    Picker("Primärquelle", selection: $binding.primarySource) {
                        Text("Keine").tag("")
                        ForEach(store.sources(for: binding.metric), id: \.self) { Text($0).tag($0) }
                    }
                    TextField("Ersatzquellen, kommagetrennt", text: Binding(get: { binding.fallbackSources.joined(separator: ", ") }, set: { binding.fallbackSources = $0.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty } }))
                    HStack { Text("Mindestqualität"); Slider(value: $binding.minimumQuality, in: 0...1, step: 0.05); Text(binding.minimumQuality.formatted(.number.precision(.fractionLength(2)))) }
                    Stepper("Maximales Alter: \(binding.maxAgeMs) ms", value: $binding.maxAgeMs, in: 0...10000, step: 250)
                    Picker("Interpolation", selection: $binding.interpolation) { Text("Keine").tag("none"); Text("Letzten Wert halten").tag("hold"); Text("Linear").tag("linear") }
                }
            }
        }.navigationTitle("Quellenrouting")
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
