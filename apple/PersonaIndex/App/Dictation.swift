import AVFoundation
import Observation
import Speech

/// Speak, in Reflect: dictation on the device only. The mic shows only where
/// the recogniser can work without a network (supportsOnDeviceRecognition),
/// and every request sets requiresOnDeviceRecognition, so speech never leaves
/// the device. No audio is kept; the words land in the editor, editable.
@MainActor
@Observable
final class Dictation {
    private(set) var listening = false
    private let recognizer = SFSpeechRecognizer(locale: Locale.current) ?? SFSpeechRecognizer(locale: Locale(identifier: "en-GB"))
    private let engine = AVAudioEngine()
    private var task: SFSpeechRecognitionTask?
    private var request: SFSpeechAudioBufferRecognitionRequest?

    /// True only where recognition can happen on the device.
    var available: Bool {
        guard let recognizer, recognizer.supportsOnDeviceRecognition else { return false }
        return SFSpeechRecognizer.authorizationStatus() != .denied && SFSpeechRecognizer.authorizationStatus() != .restricted
    }

    func toggle(onText: @escaping @MainActor (String) -> Void) {
        if listening { stop() } else { Task { await start(onText: onText) } }
    }

    private func start(onText: @escaping @MainActor (String) -> Void) async {
        let granted = await withCheckedContinuation { c in SFSpeechRecognizer.requestAuthorization { c.resume(returning: $0 == .authorized) } }
        guard granted, let recognizer, recognizer.supportsOnDeviceRecognition else { return }
        #if os(iOS)
        try? AVAudioSession.sharedInstance().setCategory(.record, mode: .measurement, options: .duckOthers)
        try? AVAudioSession.sharedInstance().setActive(true, options: .notifyOthersOnDeactivation)
        #endif
        let request = SFSpeechAudioBufferRecognitionRequest()
        request.requiresOnDeviceRecognition = true
        request.shouldReportPartialResults = false
        self.request = request
        let input = engine.inputNode
        input.installTap(onBus: 0, bufferSize: 1024, format: input.outputFormat(forBus: 0)) { buffer, _ in request.append(buffer) }
        engine.prepare()
        guard (try? engine.start()) != nil else { stop(); return }
        listening = true
        task = recognizer.recognitionTask(with: request) { [weak self] result, error in
            let text = result?.isFinal == true ? result?.bestTranscription.formattedString : nil
            let done = error != nil || result?.isFinal == true
            Task { @MainActor in
                if let text, !text.isEmpty { onText(text) }
                if done { self?.stop() }
            }
        }
    }

    func stop() {
        engine.stop()
        engine.inputNode.removeTap(onBus: 0)
        request?.endAudio()
        task?.cancel()
        task = nil
        request = nil
        listening = false
    }
}
