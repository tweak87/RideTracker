import CoreBluetooth
import Foundation

/// Optional accessory layer for external IMU or GNSS sensors.
/// The app remains fully usable without an accessory.
@MainActor
final class BLEAccessoryManager: NSObject, ObservableObject {
    enum ConnectionState: String {
        case unavailable = "Bluetooth nicht verfügbar"
        case idle = "Bereit"
        case scanning = "Suche Sensoren"
        case connecting = "Verbindet"
        case connected = "Verbunden"
        case failed = "Fehler"
    }

    struct AccessorySample: Codable {
        let timestamp: TimeInterval
        let accelerationX: Double?
        let accelerationY: Double?
        let accelerationZ: Double?
        let rotationX: Double?
        let rotationY: Double?
        let rotationZ: Double?
        let latitude: Double?
        let longitude: Double?
        let altitude: Double?
        let horizontalAccuracy: Double?
    }

    @Published private(set) var state: ConnectionState = .idle
    @Published private(set) var discoveredNames: [String] = []
    @Published private(set) var latestSample: AccessorySample?

    // Reserved RideTracker GATT identifiers. These may later be implemented
    // on an ESP32, Nordic nRF52 or compatible commercial sensor bridge.
    static let serviceUUID = CBUUID(string: "7D1A0001-6F52-4A42-9D9F-524944455452")
    static let telemetryUUID = CBUUID(string: "7D1A0002-6F52-4A42-9D9F-524944455452")

    private var central: CBCentralManager!
    private var peripherals: [UUID: CBPeripheral] = [:]

    override init() {
        super.init()
        central = CBCentralManager(delegate: self, queue: nil)
    }

    func scan() {
        guard central.state == .poweredOn else {
            state = .unavailable
            return
        }
        discoveredNames.removeAll()
        peripherals.removeAll()
        state = .scanning
        central.scanForPeripherals(withServices: [Self.serviceUUID], options: [CBCentralManagerScanOptionAllowDuplicatesKey: false])
    }

    func stopScan() {
        central.stopScan()
        if state == .scanning { state = .idle }
    }

    func connectFirst() {
        guard let peripheral = peripherals.values.first else { return }
        state = .connecting
        central.connect(peripheral)
    }

    private func decode(_ data: Data) -> AccessorySample? {
        // Initial protocol: UTF-8 JSON for easy prototyping.
        // A later binary protocol can be added without changing SensorRecorder.
        try? JSONDecoder().decode(AccessorySample.self, from: data)
    }
}

extension BLEAccessoryManager: CBCentralManagerDelegate, CBPeripheralDelegate {
    nonisolated func centralManagerDidUpdateState(_ central: CBCentralManager) {
        Task { @MainActor in
            state = central.state == .poweredOn ? .idle : .unavailable
        }
    }

    nonisolated func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral, advertisementData: [String: Any], rssi RSSI: NSNumber) {
        Task { @MainActor in
            peripherals[peripheral.identifier] = peripheral
            let name = peripheral.name ?? "RideTracker Sensor"
            if !discoveredNames.contains(name) { discoveredNames.append(name) }
        }
    }

    nonisolated func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        peripheral.delegate = self
        peripheral.discoverServices([Self.serviceUUID])
        Task { @MainActor in state = .connected }
    }

    nonisolated func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
        Task { @MainActor in state = .failed }
    }

    nonisolated func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        peripheral.services?.forEach { peripheral.discoverCharacteristics([Self.telemetryUUID], for: $0) }
    }

    nonisolated func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        service.characteristics?.filter { $0.uuid == Self.telemetryUUID }.forEach { peripheral.setNotifyValue(true, for: $0) }
    }

    nonisolated func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
        guard let data = characteristic.value else { return }
        Task { @MainActor in latestSample = decode(data) }
    }
}
