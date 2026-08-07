import CoreBluetooth
import Foundation

/// Optional accessory layer for external telemetry and standard BLE heart-rate monitors.
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
        let speedMS: Double?
        let quality: Double?
    }

    @Published private(set) var state: ConnectionState = .idle
    @Published private(set) var discoveredNames: [String] = []
    @Published private(set) var latestSample: AccessorySample?
    @Published private(set) var latestHeartRate: Int?
    @Published private(set) var connectedName: String?

    static let serviceUUID = CBUUID(string: "7D1A0001-6F52-4A42-9D9F-524944455452")
    static let telemetryUUID = CBUUID(string: "7D1A0002-6F52-4A42-9D9F-524944455452")
    static let heartRateServiceUUID = CBUUID(string: "180D")
    static let heartRateMeasurementUUID = CBUUID(string: "2A37")

    private var central: CBCentralManager!
    private var peripherals: [UUID: CBPeripheral] = [:]

    override init() {
        super.init()
        central = CBCentralManager(delegate: self, queue: nil)
    }

    func scan() { scan(services: [Self.serviceUUID]) }
    func scanHeartRate() { scan(services: [Self.heartRateServiceUUID]) }

    private func scan(services: [CBUUID]) {
        guard central.state == .poweredOn else { state = .unavailable; return }
        discoveredNames.removeAll(); peripherals.removeAll(); state = .scanning
        central.scanForPeripherals(withServices: services, options: [CBCentralManagerScanOptionAllowDuplicatesKey: false])
    }

    func stopScan() { central.stopScan(); if state == .scanning { state = .idle } }

    func connectFirst() {
        guard let peripheral = peripherals.values.first else { return }
        connect(peripheral)
    }

    func connect(named name: String) {
        guard let peripheral = peripherals.values.first(where: { ($0.name ?? "BLE-Sensor") == name }) else { return }
        connect(peripheral)
    }

    private func connect(_ peripheral: CBPeripheral) {
        state = .connecting
        central.stopScan()
        central.connect(peripheral)
    }

    private func decode(_ data: Data) -> AccessorySample? { try? JSONDecoder().decode(AccessorySample.self, from: data) }

    private func decodeHeartRate(_ data: Data) -> Int? {
        guard data.count >= 2 else { return nil }
        let flags = data[data.startIndex]
        if flags & 0x01 == 0 { return Int(data[data.startIndex + 1]) }
        guard data.count >= 3 else { return nil }
        return Int(data[data.startIndex + 1]) | (Int(data[data.startIndex + 2]) << 8)
    }
}

extension BLEAccessoryManager: CBCentralManagerDelegate, CBPeripheralDelegate {
    nonisolated func centralManagerDidUpdateState(_ central: CBCentralManager) {
        Task { @MainActor in state = central.state == .poweredOn ? .idle : .unavailable }
    }

    nonisolated func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral, advertisementData: [String: Any], rssi RSSI: NSNumber) {
        Task { @MainActor in
            peripherals[peripheral.identifier] = peripheral
            let name = peripheral.name ?? "BLE-Sensor"
            if !discoveredNames.contains(name) { discoveredNames.append(name) }
        }
    }

    nonisolated func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        peripheral.delegate = self
        peripheral.discoverServices([Self.serviceUUID, Self.heartRateServiceUUID])
        Task { @MainActor in state = .connected; connectedName = peripheral.name ?? "BLE-Sensor" }
    }

    nonisolated func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
        Task { @MainActor in state = .failed }
    }

    nonisolated func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        peripheral.services?.forEach { service in
            if service.uuid == Self.heartRateServiceUUID {
                peripheral.discoverCharacteristics([Self.heartRateMeasurementUUID], for: service)
            } else {
                peripheral.discoverCharacteristics([Self.telemetryUUID], for: service)
            }
        }
    }

    nonisolated func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        service.characteristics?.forEach { characteristic in
            if characteristic.uuid == Self.telemetryUUID || characteristic.uuid == Self.heartRateMeasurementUUID {
                peripheral.setNotifyValue(true, for: characteristic)
            }
        }
    }

    nonisolated func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
        guard let data = characteristic.value else { return }
        Task { @MainActor in
            if characteristic.uuid == Self.heartRateMeasurementUUID { latestHeartRate = decodeHeartRate(data) }
            else { latestSample = decode(data) }
        }
    }
}
