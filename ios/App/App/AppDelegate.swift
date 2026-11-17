import UIKit
import Capacitor
import UserNotifications
import AppIntents

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate, UNUserNotificationCenterDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // 결제 알림: [기록]/[무시] 버튼이 있는 알림 종류를 등록하고, 알림을 받을 수 있게 권한을 요청한다
        let center = UNUserNotificationCenter.current()
        center.delegate = self
        MonoPending.registerCategory()
        center.requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in }
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    // 앱을 보고 있을 때도 알림 배너를 띄운다
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .sound])
    }

    // 알림의 [기록] / [무시] / 알림 자체를 눌렀을 때
    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        // 여러 건 묶음 알림: [모두 기록] 또는 눌러서 앱 안에서 고르기
        if let ids = response.notification.request.content.userInfo["monoIds"] as? [String] {
            let st = response.actionIdentifier == MonoPending.recordAllAction ? "approved" : "review"
            ids.forEach { MonoPending.setStatus($0, st) }
            MonoPending.pingWeb()
        } else if let id = response.notification.request.content.userInfo["monoId"] as? String {
            switch response.actionIdentifier {
            case MonoPending.recordAction: MonoPending.setStatus(id, "approved")
            case MonoPending.ignoreAction: MonoPending.setStatus(id, "ignored")
            default: MonoPending.setStatus(id, "review") // 알림을 눌러 앱을 열면 앱 안에서 다시 묻는다
            }
            MonoPending.pingWeb()
        }
        completionHandler()
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}


// MARK: - 결제 알림 → Mono
// 단축어(애플페이·카드 문자 자동화)가 보낸 결제 내용을 잠시 보관하는 곳.
// 웹 화면은 @capacitor/preferences로 같은 값(monoPending)을 읽고 처리한 뒤 지운다.
enum MonoPending {
    static let key = "CapacitorStorage.monoPending"
    static let category = "MONO_PAYMENT"
    static let recordAction = "MONO_RECORD"
    static let ignoreAction = "MONO_IGNORE"
    static let batchCategory = "MONO_PAYMENTS"
    static let recordAllAction = "MONO_RECORD_ALL"
    static let batchId = "mono-batch"

    static func load() -> [[String: Any]] {
        guard let s = UserDefaults.standard.string(forKey: key), let d = s.data(using: .utf8),
              let a = try? JSONSerialization.jsonObject(with: d) as? [[String: Any]] else { return [] }
        return a
    }
    static func save(_ a: [[String: Any]]) {
        if let d = try? JSONSerialization.data(withJSONObject: a), let s = String(data: d, encoding: .utf8) {
            UserDefaults.standard.set(s, forKey: key)
        }
    }
    static func add(text: String) -> String {
        let id = UUID().uuidString
        var a = load()
        a.append(["id": id, "text": text, "ts": Int(Date().timeIntervalSince1970 * 1000), "status": "pending"])
        save(a)
        return id
    }
    static func setStatus(_ id: String, _ status: String) {
        var a = load()
        for i in a.indices where (a[i]["id"] as? String) == id { a[i]["status"] = status }
        save(a)
    }

    static func registerCategory() {
        let record = UNNotificationAction(identifier: recordAction, title: "기록", options: [.foreground]) // 누르면 앱이 열리며 바로 기록
        let ignore = UNNotificationAction(identifier: ignoreAction, title: "무시", options: [.destructive])
        let cat = UNNotificationCategory(identifier: category, actions: [record, ignore], intentIdentifiers: [], options: [])
        let all = UNNotificationAction(identifier: recordAllAction, title: "모두 기록", options: [.foreground])
        let batch = UNNotificationCategory(identifier: batchCategory, actions: [all], intentIdentifiers: [], options: [])
        UNUserNotificationCenter.current().setNotificationCategories([cat, batch])
    }

    // 알림에 보일 짧은 요약: 카드 이름 · 금액
    static func summary(_ text: String) -> String {
        func first(_ pattern: String) -> String? {
            guard let re = try? NSRegularExpression(pattern: pattern),
                  let m = re.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)),
                  let r = Range(m.range(at: 1), in: text) else { return nil }
            return String(text[r])
        }
        let card = first("([가-힣A-Za-z]{1,8}(?:카드|페이|체크))")
        let amount = first("([0-9][0-9,]*)\\s*원") ?? first("₩\\s*([0-9][0-9,]*)")
        let parts = [card, amount.map { "\($0)원" }].compactMap { $0 }
        if parts.isEmpty { return String(text.prefix(40)) }
        return parts.joined(separator: " · ")
    }

    // 알림 글에서 금액(원) 숫자만
    static func amountValue(_ text: String) -> Int {
        guard let re = try? NSRegularExpression(pattern: "([0-9][0-9,]*)\\s*원"),
              let m = re.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)),
              let r = Range(m.range(at: 1), in: text) else { return 0 }
        return Int(text[r].replacingOccurrences(of: ",", with: "")) ?? 0
    }

    static func notify(id: String, text: String) {
        // 아직 답하지 않은 결제가 여러 건이면 알림 하나로 묶는다: "결제 3건이 기다리고 있어요 · 총 24,300원"
        let waiting = load().filter { ($0["status"] as? String) == "pending" }
        if waiting.count > 1 {
            let ids = waiting.compactMap { $0["id"] as? String }
            let total = waiting.reduce(0) { $0 + amountValue(($1["text"] as? String) ?? "") }
            let fmt = NumberFormatter(); fmt.numberStyle = .decimal
            let c = UNMutableNotificationContent()
            c.title = summary(text)
            c.body = "결제 \(ids.count)건이 기다리고 있어요" + (total > 0 ? " · 총 \(fmt.string(from: NSNumber(value: total)) ?? String(total))원" : "")
            c.sound = .default
            c.categoryIdentifier = batchCategory
            c.userInfo = ["monoIds": ids]
            let center = UNUserNotificationCenter.current()
            center.removeDeliveredNotifications(withIdentifiers: ids + [batchId])
            center.add(UNNotificationRequest(identifier: batchId, content: c, trigger: nil))
            return
        }
        let c = UNMutableNotificationContent()
        // 제목만 봐도 어떤 결제인지: "현대카드 · 5,800원" / 내용: "가계부에 기록할까요?" (앱 이름 Mono는 iOS가 위에 붙여 줌)
        c.title = summary(text)
        c.body = "가계부에 기록할까요?"
        c.sound = .default
        c.categoryIdentifier = category
        c.userInfo = ["monoId": id]
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: id, content: c, trigger: nil))
    }

    // 앱이 열려 있으면 웹 화면에 바로 알려서 처리하게 한다
    static func pingWeb() {
        DispatchQueue.main.async {
            for scene in UIApplication.shared.connectedScenes {
                if let ws = scene as? UIWindowScene,
                   let vc = ws.windows.first?.rootViewController as? CAPBridgeViewController {
                    vc.bridge?.triggerWindowJSEvent(eventName: "monoPending")
                }
            }
        }
    }
}

// 단축어 동작: "Mono에 결제 보내기"
@available(iOS 16.0, *)
struct RecordPaymentIntent: AppIntent {
    static var title: LocalizedStringResource = "Mono에 결제 보내기"
    static var description = IntentDescription("결제 내용(애플페이 정보나 카드 문자)을 Mono로 보내고, 가계부에 기록할지 묻는 알림을 띄워요.")
    static var openAppWhenRun: Bool = false

    // 자동화 바로 다음에 넣으면 앞 단계의 결과(단축어 입력)가 자동으로 연결되게
    @Parameter(title: "결제 내용", inputConnectionBehavior: .connectToPreviousIntentResult)
    var text: String

    static var parameterSummary: some ParameterSummary {
        Summary("\(\.$text)을 Mono로 보내기")
    }

    func perform() async throws -> some IntentResult {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return .result() }
        let id = MonoPending.add(text: trimmed)
        MonoPending.registerCategory()
        MonoPending.notify(id: id, text: trimmed)
        MonoPending.pingWeb()
        return .result()
    }
}

@available(iOS 16.0, *)
struct MonoShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(intent: RecordPaymentIntent(), phrases: ["\(.applicationName)에 결제 보내기"])
    }
}

// ---------- 영수증 읽기 (앱을 나가도 끝까지) ----------
// 웹 화면은 앱이 백그라운드로 가면 멈추므로, Gemini 요청은 네이티브에서 보낸다.
// 읽는 동안 앱을 나가면 끝난 뒤 "영수증을 읽었어요" 알림을 띄우고, 결과는 저장해 두었다가 앱을 열면 웹이 가져간다.
class MonoViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(MonoReceiptPlugin())
    }
}

@objc(MonoReceiptPlugin)
public class MonoReceiptPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "MonoReceiptPlugin"
    public let jsName = "MonoReceipt"
    public let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "read", returnType: CAPPluginReturnPromise)]
    static let resultKey = "CapacitorStorage.monoReceipt"

    @objc func read(_ call: CAPPluginCall) {
        guard let key = call.getString("key"), let prompt = call.getString("prompt"),
              let data = call.getString("data"), let schema = call.getObject("schema") else {
            call.reject("missing params"); return
        }
        let mime = call.getString("mime") ?? "image/jpeg"
        let models = (call.getArray("models") as? [String]) ?? ["gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-flash-lite-latest"]
        var task: UIBackgroundTaskIdentifier = .invalid
        task = UIApplication.shared.beginBackgroundTask(withName: "monoReceipt") {
            UIApplication.shared.endBackgroundTask(task); task = .invalid
        }
        func finish(_ result: [String: Any]?, _ err: String?) {
            DispatchQueue.main.async {
                let background = UIApplication.shared.applicationState != .active
                if let r = result {
                    // 웹이 멈춰 있어도 잃어버리지 않게 저장 (앱을 열면 웹이 꺼내 감)
                    var saved = r; saved["ts"] = Int(Date().timeIntervalSince1970 * 1000)
                    if let d = try? JSONSerialization.data(withJSONObject: saved), let s = String(data: d, encoding: .utf8) {
                        UserDefaults.standard.set(s, forKey: MonoReceiptPlugin.resultKey)
                    }
                    if background { MonoReceiptPlugin.notifyDone(r) }
                    call.resolve(["result": r])
                } else {
                    if background { MonoReceiptPlugin.notifyFail() }
                    call.reject(err ?? "failed")
                }
                if task != .invalid { UIApplication.shared.endBackgroundTask(task); task = .invalid }
            }
        }
        MonoReceiptPlugin.tryModels(models, key: key, prompt: prompt, data: data, mime: mime, schema: schema, finish: finish)
    }

    // 모델을 차례로: 붐비거나(429·5xx) 실패하면 다음 모델
    static func tryModels(_ models: [String], key: String, prompt: String, data: String, mime: String,
                          schema: [String: Any], finish: @escaping ([String: Any]?, String?) -> Void) {
        guard let model = models.first else { finish(nil, "all models failed"); return }
        let rest = Array(models.dropFirst())
        // 사진 해상도는 중간: 영수증 글자는 읽히고 처리 시간은 줄어든다
        var gen: [String: Any] = ["temperature": 0, "responseMimeType": "application/json", "responseSchema": schema, "mediaResolution": "MEDIA_RESOLUTION_MEDIUM"]
        if model.hasPrefix("gemini-3.") && model.contains("flash") { gen["thinkingConfig"] = ["thinkingLevel": "minimal"] }
        let body: [String: Any] = [
            "contents": [["role": "user", "parts": [["text": prompt], ["inline_data": ["mime_type": mime, "data": data]]]]],
            "generationConfig": gen,
        ]
        guard let url = URL(string: "https://generativelanguage.googleapis.com/v1beta/models/\(model):generateContent"),
              let payload = try? JSONSerialization.data(withJSONObject: body) else { finish(nil, "bad request"); return }
        var req = URLRequest(url: url, timeoutInterval: rest.isEmpty ? 25 : 12)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "content-type")
        req.setValue(key, forHTTPHeaderField: "x-goog-api-key")
        req.httpBody = payload
        let t0 = Date()
        URLSession.shared.dataTask(with: req) { d, resp, err in
            let status = (resp as? HTTPURLResponse)?.statusCode ?? 0
            print("[receipt] \(model) \(status) \(Int(Date().timeIntervalSince(t0) * 1000))ms \(err?.localizedDescription ?? "")")
            if let d = d, status == 200,
               let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any],
               let parts = ((j["candidates"] as? [[String: Any]])?.first?["content"] as? [String: Any])?["parts"] as? [[String: Any]] {
                let text = parts.compactMap { $0["text"] as? String }.joined()
                if let td = text.data(using: .utf8), let r = try? JSONSerialization.jsonObject(with: td) as? [String: Any] {
                    finish(r, nil); return
                }
            }
            // 키가 틀린 경우(400·401·403)는 다른 모델로 넘어가도 소용없다
            if [400, 401, 403].contains(status) { finish(nil, "Gemini \(status)"); return }
            tryModels(rest, key: key, prompt: prompt, data: data, mime: mime, schema: schema, finish: finish)
        }.resume()
    }

    static func notifyDone(_ r: [String: Any]) {
        let fmt = NumberFormatter(); fmt.numberStyle = .decimal
        let merchant = (r["merchant"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? "영수증"
        let total = (r["total"] as? NSNumber).map { (fmt.string(from: $0) ?? "\($0)") + "원" }
        let readable = (r["readable"] as? Bool) ?? true
        let c = UNMutableNotificationContent()
        c.title = readable ? "영수증을 읽었어요" : "영수증을 읽지 못했어요"
        c.body = readable ? ([merchant, total].compactMap { $0 }.joined(separator: " · ") + " — 눌러서 기록하기") : "다시 찍어 주세요."
        c.sound = .default
        c.userInfo = ["monoReceipt": true]
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: "mono-receipt", content: c, trigger: nil))
    }
    static func notifyFail() {
        let c = UNMutableNotificationContent()
        c.title = "영수증을 읽지 못했어요"; c.body = "잠시 뒤 다시 시도해 주세요."; c.sound = .default
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: "mono-receipt", content: c, trigger: nil))
    }
}
