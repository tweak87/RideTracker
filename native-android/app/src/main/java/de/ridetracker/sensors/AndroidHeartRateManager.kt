package de.ridetracker.sensors

import android.annotation.SuppressLint
import android.bluetooth.*
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.os.ParcelUuid
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import java.util.UUID

@SuppressLint("MissingPermission")
class AndroidHeartRateManager(private val context: Context) {
    var status by mutableStateOf("Nicht verbunden"); private set
    var latestHeartRate by mutableStateOf<Int?>(null); private set
    var deviceName by mutableStateOf<String?>(null); private set

    private val manager = context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
    private val adapter get() = manager.adapter
    private var foundDevice: BluetoothDevice? = null
    private var gatt: BluetoothGatt? = null

    private val heartRateService = UUID.fromString("0000180d-0000-1000-8000-00805f9b34fb")
    private val heartRateMeasurement = UUID.fromString("00002a37-0000-1000-8000-00805f9b34fb")

    private val scanCallback = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult) {
            foundDevice = result.device
            deviceName = result.device.name ?: "Pulsuhr"
            status = "Gefunden: ${deviceName}"
            adapter.bluetoothLeScanner?.stopScan(this)
        }
        override fun onScanFailed(errorCode: Int) { status = "Bluetooth-Suche fehlgeschlagen ($errorCode)" }
    }

    fun scan() {
        latestHeartRate = null; foundDevice = null; status = "Suche Pulsuhr …"
        val filter = ScanFilter.Builder().setServiceUuid(ParcelUuid(heartRateService)).build()
        val settings = ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build()
        adapter.bluetoothLeScanner?.startScan(listOf(filter), settings, scanCallback) ?: run { status = "Bluetooth LE nicht verfügbar" }
    }

    fun connect() {
        val device = foundDevice ?: run { status = "Zuerst Pulsuhr suchen"; return }
        status = "Verbindet …"
        gatt?.close()
        gatt = device.connectGatt(context, false, callback, BluetoothDevice.TRANSPORT_LE)
    }

    fun close() { adapter.bluetoothLeScanner?.stopScan(scanCallback); gatt?.close(); gatt = null }

    private val callback = object : BluetoothGattCallback() {
        override fun onConnectionStateChange(gatt: BluetoothGatt, statusCode: Int, newState: Int) {
            if (newState == BluetoothProfile.STATE_CONNECTED) { status = "Verbunden"; gatt.discoverServices() }
            else if (newState == BluetoothProfile.STATE_DISCONNECTED) status = "Getrennt"
        }

        override fun onServicesDiscovered(gatt: BluetoothGatt, statusCode: Int) {
            val characteristic = gatt.getService(heartRateService)?.getCharacteristic(heartRateMeasurement) ?: run { status = "Herzfrequenzdienst fehlt"; return }
            gatt.setCharacteristicNotification(characteristic, true)
            characteristic.getDescriptor(UUID.fromString("00002902-0000-1000-8000-00805f9b34fb"))?.let { descriptor ->
                descriptor.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
                gatt.writeDescriptor(descriptor)
            }
        }

        override fun onCharacteristicChanged(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic) {
            val values = characteristic.value
            val flags = values.getOrNull(0)?.toInt() ?: return
            latestHeartRate = if (flags and 1 == 0) values.getOrNull(1)?.toInt()?.and(0xff)
            else if (values.size >= 3) (values[1].toInt() and 0xff) or ((values[2].toInt() and 0xff) shl 8) else null
        }
    }
}
