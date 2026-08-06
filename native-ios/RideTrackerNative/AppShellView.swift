import SwiftUI

enum NativeSection: String, CaseIterable, Identifiable {
    case home, record, rides, map, devices, settings, hud
    var id: String { rawValue }
    var title: String { switch self { case .home:"Start"; case .record:"Aufzeichnen"; case .rides:"Fahrten"; case .map:"Karte"; case .devices:"Geräte"; case .settings:"Einstellungen"; case .hud:"HUD" } }
    var icon: String { switch self { case .home:"house.fill"; case .record:"record.circle"; case .rides:"list.bullet.rectangle"; case .map:"map.fill"; case .devices:"sensor.tag.radiowaves.forward.fill"; case .settings:"gearshape.fill"; case .hud:"rectangle.3.group.fill" } }
}

struct AppShellView: View {
    @EnvironmentObject private var recorder: SensorRecorder
    @EnvironmentObject private var profiles: UserProfileStore
    @State private var section: NativeSection = .home
    @State private var showProfiles = false
    var body: some View {
        TabView(selection: $section) {
            NativeDashboard(section:$section,profileName:profiles.activeProfile.name,showProfiles:{showProfiles=true}).tag(NativeSection.home).tabItem{Label("Start",systemImage:NativeSection.home.icon)}
            NativeRecordingView().tag(NativeSection.record).tabItem{Label("Aufzeichnen",systemImage:NativeSection.record.icon)}
            RideLibraryView().tag(NativeSection.rides).tabItem{Label("Fahrten",systemImage:NativeSection.rides.icon)}
            RideMapListView().tag(NativeSection.map).tabItem{Label("Karte",systemImage:NativeSection.map.icon)}
            DeviceCenterView().tag(NativeSection.devices).tabItem{Label("Geräte",systemImage:NativeSection.devices.icon)}
            NativeSettingsView().tag(NativeSection.settings).tabItem{Label("Einstellungen",systemImage:NativeSection.settings.icon)}
            NativeHUDFullscreenLauncher().tag(NativeSection.hud).tabItem{Label("HUD",systemImage:NativeSection.hud.icon)}
        }
        .overlay(alignment:.topLeading){ GlobalMenuButton(section:$section).padding(.top,8).padding(.leading,8) }
        .safeAreaInset(edge:.bottom,spacing:0){ if recorder.isRecording { HStack(spacing:10){Circle().fill(.red).frame(width:10,height:10);VStack(alignment:.leading){Text("Aufnahme läuft").font(.headline);Text("Sensoren und optional Video werden aufgezeichnet.").font(.caption).foregroundStyle(.secondary)};Spacer();Button("Stoppen",role:.destructive){recorder.stop()}.buttonStyle(.borderedProminent).tint(.red)}.padding(12).background(.ultraThinMaterial) } }
        .sheet(isPresented:$showProfiles){NativeProfileSheet().environmentObject(profiles)}
    }
}

private struct GlobalMenuButton: View {
    @Binding var section: NativeSection
    @State private var open=false
    var body: some View { Button { open=true } label:{Image(systemName:"line.3.horizontal").frame(width:34,height:34).background(.ultraThinMaterial,in:Circle())}.confirmationDialog("Hauptmenü",isPresented:$open,titleVisibility:.visible){ForEach(NativeSection.allCases){target in Button(target.title){section=target}};Button("Abbrechen",role:.cancel){}} }
}

private struct NativeDashboard: View {
    @Binding var section: NativeSection; let profileName:String; let showProfiles:()->Void
    var body: some View { NavigationStack { ScrollView { VStack(alignment:.leading,spacing:14){Text("RideTracker").font(.largeTitle.bold());Text("Angemeldet: \(profileName)").foregroundStyle(.secondary);NativeMenuCard("Neue Fahrt","Video und Telemetrie aufzeichnen","record.circle.fill"){section = .record};NativeMenuCard("Meine Fahrten","Gespeicherte RidePackages öffnen","list.bullet.rectangle.fill"){section = .rides};NativeMenuCard("Parks & Strecken","GPS-Fahrten und Startpositionen","map.fill"){section = .map};NativeMenuCard("Geräte & Sensoren","Interne und externe Quellen konfigurieren","sensor.tag.radiowaves.forward.fill"){section = .devices};NativeMenuCard("Einstellungen","Kalibrierung, Sensoren und Berechtigungen","gearshape.fill"){section = .settings};NativeMenuCard("HUD-Konfiguration","Vollbild-Editor für Hoch- und Querformat","rectangle.3.group.fill"){section = .hud};Button("Benutzer verwalten",action:showProfiles).buttonStyle(.bordered).frame(maxWidth:.infinity)}.padding() }.navigationTitle("Übersicht") } }
}

private struct NativeRecordingView: View {
    @EnvironmentObject private var recorder: SensorRecorder
    @State private var showStartChoice=false
    var body: some View { NavigationStack { ScrollView { VStack(spacing:14){RoundedRectangle(cornerRadius:20).fill(Color.black).aspectRatio(16/9,contentMode:.fit).overlay{ZStack{VStack(spacing:8){Image(systemName:"video.fill").font(.largeTitle);Text(recorder.videoRecorder.status).font(.caption).foregroundStyle(.secondary);Text("Native Kameravorschau wird über AVFoundation bereitgestellt.").font(.caption2).foregroundStyle(.secondary)};NativeLiveHUDOverlay(recorder:recorder)}.clipShape(RoundedRectangle(cornerRadius:20))};HStack{Text("Status");Spacer();Text(recorder.status)};HStack{Text("Tempo");Spacer();Text(String(format:"%.1f km/h",recorder.speedKmh)).monospacedDigit()};HStack{Text("Höhe");Spacer();Text(String(format:"%.1f m",recorder.relativeAltitude)).monospacedDigit()};Button(recorder.isRecording ? "Aufnahme stoppen":"Kalibrieren & Fahrt starten"){if recorder.isRecording{recorder.stop()}else{showStartChoice=true}}.buttonStyle(.borderedProminent).tint(recorder.isRecording ? .red:.blue).frame(maxWidth:.infinity);Button("RidePackage speichern"){_=try? recorder.saveSession()}.buttonStyle(.bordered).disabled(recorder.isRecording || recorder.samples.isEmpty)}.padding() }.navigationTitle("Neue Fahrt").confirmationDialog("Video mit aufzeichnen?",isPresented:$showStartChoice,titleVisibility:.visible){Button("Mit Video starten"){recorder.calibrateAndStart(video:true)};Button("Ohne Video starten"){recorder.calibrateAndStart(video:false)};Button("Abbrechen",role:.cancel){}} } }
}

private struct NativeMenuCard: View { let title:String;let subtitle:String;let icon:String;let action:()->Void;init(_ title:String,_ subtitle:String,_ icon:String,action:@escaping()->Void){self.title=title;self.subtitle=subtitle;self.icon=icon;self.action=action}var body:some View{Button(action:action){HStack(spacing:14){Image(systemName:icon).font(.title2).frame(width:40);VStack(alignment:.leading){Text(title).font(.headline);Text(subtitle).font(.caption).foregroundStyle(.secondary)};Spacer();Image(systemName:"chevron.right").foregroundStyle(.secondary)}.padding().background(.thinMaterial,in:RoundedRectangle(cornerRadius:17))}.buttonStyle(.plain)}}

private struct NativeProfileSheet: View { @EnvironmentObject private var profiles:UserProfileStore;@Environment(\.dismiss) private var dismiss;@State private var name="";var body:some View{NavigationStack{Form{Section("Profile"){ForEach(profiles.profiles){profile in Button(profile.id == profiles.activeProfileID ? "✓ \(profile.name)":profile.name){profiles.select(profile.id)}}};Section("Neu"){TextField("Benutzername",text:$name);Button("Profil anlegen"){profiles.create(name:name);name=""}.disabled(name.trimmingCharacters(in:.whitespaces).isEmpty)}}.navigationTitle("Benutzer").toolbar{Button("Fertig"){dismiss()}}}}}
