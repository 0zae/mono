import UIKit
import Capacitor

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
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
