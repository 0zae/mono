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
        if let id = response.notification.request.content.userInfo["monoId"] as? String {
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
        UNUserNotificationCenter.current().setNotificationCategories([cat])
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

    static func notify(id: String, text: String) {
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

    @Parameter(title: "결제 내용")
    var text: String

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
