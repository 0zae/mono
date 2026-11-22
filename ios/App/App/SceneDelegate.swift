import UIKit
import Capacitor

// 아이콘 길게 누르기 메뉴: 고른 동작을 저장해 두고 웹에 알린다 (웹이 입력칸 포커스 / 스캔을 연다)
enum MonoQuickAction {
    static let key = "CapacitorStorage.monoAction"
    static func handle(_ item: UIApplicationShortcutItem) { handle(action: item.type.hasSuffix(".scan") ? "scan" : "quick") }
    // 위젯: mono://quick, mono://scan
    static func handle(url: URL) -> Bool {
        guard url.scheme == "mono", let h = url.host, h == "quick" || h == "scan" else { return false }
        handle(action: h); return true
    }
    static func handle(action: String) {
        UserDefaults.standard.set(action, forKey: key)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            for scene in UIApplication.shared.connectedScenes {
                if let ws = scene as? UIWindowScene, let vc = ws.windows.first?.rootViewController as? CAPBridgeViewController {
                    vc.bridge?.triggerWindowJSEvent(eventName: "monoAction")
                }
            }
        }
    }
}

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        let root = MonoViewController() // 영수증 읽기 플러그인을 등록하는 Mono 전용 화면
        window?.rootViewController = root
        // 키보드가 올라와 웹 화면이 줄어들 때 그 뒤로 보이는 바탕: 앱 배경과 같은 색(라이트 흰색, 다크 검정)
        window?.backgroundColor = .systemBackground
        root.view.backgroundColor = .systemBackground
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
        if let item = connectionOptions.shortcutItem { MonoQuickAction.handle(item) }
        if let url = connectionOptions.urlContexts.first?.url { _ = MonoQuickAction.handle(url: url) }
    }

    // 앱이 떠 있을 때 아이콘 길게 누르기 메뉴를 고른 경우
    func windowScene(_ windowScene: UIWindowScene, performActionFor shortcutItem: UIApplicationShortcutItem,
                     completionHandler: @escaping (Bool) -> Void) {
        MonoQuickAction.handle(shortcutItem); completionHandler(true)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        if let url = URLContexts.first?.url, MonoQuickAction.handle(url: url) { return }
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
