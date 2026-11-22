import WidgetKit
import SwiftUI
import AppIntents

// Mono 위젯: 누르면 바로 기록(또는 스캔)으로 가는 버튼 위젯
//  A · 주황 한 칸 (작은 크기)   C · 첫 화면 축소판 (중간 크기)   D · 잠금 화면
//  - 위젯 편집에서 테마(default / liquid)를 고른다 (무료 계정이라 앱 설정을 직접 읽을 수 없어서)
//  - iOS 홈 화면이 '투명·색조'일 때는 iOS가 유리처럼 그려 주므로, 글자만 남는 로고로 맞춘다
//  누르면 mono://quick (입력칸) / mono://scan (영수증 스캔)

private let monoOrange = Color(red: 1, green: 90/255, blue: 46/255)
private let quickURL = URL(string: "mono://quick")!
private let scanURL = URL(string: "mono://scan")!

// ---------- 위젯 편집: 테마 ----------
enum MonoTheme: String, AppEnum {
    case standard, liquid
    static var typeDisplayRepresentation: TypeDisplayRepresentation = "테마"
    static var caseDisplayRepresentations: [MonoTheme: DisplayRepresentation] = [.standard: "default", .liquid: "liquid"]
}

struct ThemeIntent: WidgetConfigurationIntent {
    static var title: LocalizedStringResource = "테마"
    static var description = IntentDescription("Mono 앱에서 고른 테마와 같게 맞춰 주세요.")
    @Parameter(title: "테마", default: .standard) var theme: MonoTheme
}

struct MonoEntry: TimelineEntry { let date: Date; let theme: MonoTheme }

struct ThemedProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> MonoEntry { MonoEntry(date: .now, theme: .standard) }
    func snapshot(for configuration: ThemeIntent, in context: Context) async -> MonoEntry { MonoEntry(date: .now, theme: configuration.theme) }
    func timeline(for configuration: ThemeIntent, in context: Context) async -> Timeline<MonoEntry> {
        Timeline(entries: [MonoEntry(date: .now, theme: configuration.theme)], policy: .never) // 버튼이라 다시 그릴 필요 없음
    }
}

struct StaticProvider: TimelineProvider {
    func placeholder(in context: Context) -> MonoEntry { MonoEntry(date: .now, theme: .standard) }
    func getSnapshot(in context: Context, completion: @escaping (MonoEntry) -> Void) { completion(placeholder(in: context)) }
    func getTimeline(in context: Context, completion: @escaping (Timeline<MonoEntry>) -> Void) {
        completion(Timeline(entries: [placeholder(in: context)], policy: .never))
    }
}

// ---------- liquid 바탕: 앱 배경처럼 옅은 웜톤 위에 뿌연 원 ----------
struct LiquidWall: View {
    @Environment(\.colorScheme) var scheme
    var body: some View {
        let dark = scheme == .dark
        ZStack {
            LinearGradient(colors: dark ? [Color(red: 0.08, green: 0.06, blue: 0.06), Color(red: 0.11, green: 0.08, blue: 0.07)]
                                        : [Color(red: 0.98, green: 0.96, blue: 0.94), Color(red: 0.97, green: 0.93, blue: 0.91)],
                           startPoint: .topLeading, endPoint: .bottomTrailing)
            Circle().fill((dark ? Color(red: 0.35, green: 0.17, blue: 0.11) : Color(red: 0.95, green: 0.78, blue: 0.70)).opacity(0.75))
                .frame(width: 170).blur(radius: 40).offset(x: -90, y: -50)
            Circle().fill((dark ? Color(red: 0.24, green: 0.15, blue: 0.2) : Color(red: 0.91, green: 0.83, blue: 0.88)).opacity(0.7))
                .frame(width: 150).blur(radius: 40).offset(x: 110, y: 55)
        }
    }
}

// 유리 테두리 빛 (위·왼쪽이 밝게)
struct GlassRim: ViewModifier {
    var radius: CGFloat
    func body(content: Content) -> some View {
        content.overlay(
            RoundedRectangle(cornerRadius: radius, style: .continuous)
                .strokeBorder(LinearGradient(colors: [.white.opacity(0.95), .white.opacity(0.25), .white.opacity(0.55)],
                                             startPoint: .topLeading, endPoint: .bottomTrailing), lineWidth: 1)
        )
    }
}

// 앱 입력창 왼쪽의 '펜 + 밑줄' 아이콘 (24×24 기준)
struct PenIcon: Shape {
    func path(in r: CGRect) -> Path {
        let k = min(r.width, r.height) / 24
        func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: r.minX + x * k, y: r.minY + y * k) }
        var path = Path()
        path.move(to: p(12, 20)); path.addLine(to: p(20, 20)) // 밑줄
        // 펜: 둥근 머리 → 몸통 → 뾰족한 끝
        path.move(to: p(15.5, 4.5))
        path.addArc(center: p(17, 6), radius: 2.1 * k, startAngle: .degrees(225), endAngle: .degrees(45), clockwise: false)
        path.addLine(to: p(8, 18)); path.addLine(to: p(4, 19)); path.addLine(to: p(5, 15)); path.closeSubpath()
        return path
    }
}

// 앱 입력창 오른쪽의 스캔 아이콘과 같은 모양 (네 귀퉁이 틀 + 글줄 세 개, 21×21 기준)
struct ScanIcon: Shape {
    func path(in r: CGRect) -> Path {
        let k = min(r.width, r.height) / 21
        func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: r.minX + x * k, y: r.minY + y * k) }
        var path = Path()
        // 귀퉁이 네 개 (모서리 반지름 2.5)
        path.move(to: p(2, 7)); path.addLine(to: p(2, 4.5)); path.addArc(tangent1End: p(2, 2), tangent2End: p(4.5, 2), radius: 2.5 * k); path.addLine(to: p(7, 2))
        path.move(to: p(14, 2)); path.addLine(to: p(16.5, 2)); path.addArc(tangent1End: p(19, 2), tangent2End: p(19, 4.5), radius: 2.5 * k); path.addLine(to: p(19, 7))
        path.move(to: p(19, 14)); path.addLine(to: p(19, 16.5)); path.addArc(tangent1End: p(19, 19), tangent2End: p(16.5, 19), radius: 2.5 * k); path.addLine(to: p(14, 19))
        path.move(to: p(7, 19)); path.addLine(to: p(4.5, 19)); path.addArc(tangent1End: p(2, 19), tangent2End: p(2, 16.5), radius: 2.5 * k); path.addLine(to: p(2, 14))
        // 글줄 세 개
        path.move(to: p(6.5, 8)); path.addLine(to: p(14.5, 8))
        path.move(to: p(6.5, 10.5)); path.addLine(to: p(14.5, 10.5))
        path.move(to: p(6.5, 13)); path.addLine(to: p(11.5, 13))
        return path
    }
}

// ---------- A · 주황 한 칸 ----------
struct QuickTileView: View {
    let theme: MonoTheme
    @Environment(\.widgetRenderingMode) var mode
    var body: some View {
        let full = mode == .fullColor
        VStack(alignment: .leading) {
            Image("LogoGlyph").resizable().scaledToFit().frame(height: 24)
                .foregroundStyle(full ? .white : .primary).widgetAccentable()
                .padding(.leading, -8) // 글자 바깥 여백 보정
            Spacer()
            HStack(spacing: 6) {
                Image(systemName: "plus").font(.system(size: 18, weight: .bold))
                Text("기록하기").font(.system(size: 19, weight: .bold))
            }
            .foregroundStyle(full ? .white : .primary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .containerBackground(for: .widget) {
            if theme == .liquid {
                // 주황 유리: 위에서 빛이 비치는 그라데이션 + 위쪽 하이라이트
                ZStack {
                    LinearGradient(colors: [Color(red: 1, green: 0.48, blue: 0.3), monoOrange, Color(red: 0.92, green: 0.3, blue: 0.16)],
                                   startPoint: .topLeading, endPoint: .bottomTrailing)
                    LinearGradient(colors: [.white.opacity(0.35), .clear], startPoint: .top, endPoint: .center)
                }
            } else {
                monoOrange
            }
        }
        .widgetURL(quickURL)
    }
}

// ---------- C · 첫 화면 축소판 ----------
struct HomeBarView: View {
    let theme: MonoTheme
    @Environment(\.widgetRenderingMode) var mode
    var body: some View {
        let full = mode == .fullColor
        let liquid = theme == .liquid && full
        VStack(spacing: 14) {
            // 앱 첫 화면과 같은 로고: 박스 없이 주황 글자만 (색조 모드에서는 iOS 색으로)
            Image("LogoGlyph").resizable().scaledToFit()
                .foregroundStyle(full ? AnyShapeStyle(monoOrange) : AnyShapeStyle(.primary))
                .widgetAccentable()
                .frame(height: 30)
            HStack(spacing: 8) {
                Link(destination: quickURL) {
                    HStack(spacing: 8) {
                        PenIcon() // 앱 입력창과 같은 '펜 + 밑줄' 아이콘
                            .stroke(style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
                            .foregroundStyle(.secondary)
                            .frame(width: 18, height: 18)
                        Text("기록하기").foregroundStyle(.secondary)
                        Spacer(minLength: 0)
                    }
                    .font(.system(size: 15))
                    .frame(maxHeight: .infinity)
                }
                Link(destination: scanURL) {
                    ScanIcon()
                        .stroke(style: StrokeStyle(lineWidth: 1.8, lineCap: .round, lineJoin: .round))
                        .foregroundStyle(full ? AnyShapeStyle(monoOrange) : AnyShapeStyle(.primary))
                        .widgetAccentable()
                        .frame(width: 21, height: 21)
                        .frame(width: 36, height: 36)
                }
            }
            .padding(.leading, 14).padding(.trailing, 4)
            .frame(height: 44)
            .background {
                if liquid {
                    Capsule().fill(.white.opacity(0.62)).modifier(GlassRim(radius: 22))
                        .shadow(color: Color(red: 0.31, green: 0.12, blue: 0.04).opacity(0.10), radius: 8, y: 3)
                } else {
                    Capsule().fill(Color(.tertiarySystemFill))
                }
            }
        }
        .containerBackground(for: .widget) {
            if theme == .liquid { LiquidWall() } else { Color(.systemBackground) }
        }
        .widgetURL(quickURL)
    }
}

// ---------- D · 잠금 화면 (iOS가 잠금 화면 모양으로 그림) ----------
struct LockView: View {
    @Environment(\.widgetFamily) var family
    var body: some View {
        Group {
            switch family {
            case .accessoryCircular:
                ZStack {
                    AccessoryWidgetBackground()
                    Image(systemName: "plus").font(.system(size: 22, weight: .semibold))
                }
            case .accessoryRectangular:
                VStack(alignment: .leading, spacing: 2) {
                    Text("mono").font(.system(size: 12, weight: .heavy)).opacity(0.7)
                    Label("기록하기", systemImage: "plus").font(.system(size: 15, weight: .semibold))
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            default:
                Label("Mono 기록하기", systemImage: "plus")
            }
        }
        .containerBackground(.clear, for: .widget)
        .widgetURL(quickURL)
    }
}

struct QuickTileWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: "MonoQuickTile", intent: ThemeIntent.self, provider: ThemedProvider()) { e in QuickTileView(theme: e.theme) }
            .configurationDisplayName("기록하기")
            .description("누르면 바로 기록해요. 길게 눌러 테마를 고를 수 있어요.")
            .supportedFamilies([.systemSmall])
    }
}

struct HomeBarWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: "MonoHomeBar", intent: ThemeIntent.self, provider: ThemedProvider()) { e in HomeBarView(theme: e.theme) }
            .configurationDisplayName("기록하기")
            .description("입력창을 누르면 기록, 오른쪽은 영수증 스캔. 길게 눌러 테마를 고를 수 있어요.")
            .supportedFamilies([.systemMedium])
    }
}

struct LockWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "MonoLock", provider: StaticProvider()) { _ in LockView() }
            .configurationDisplayName("기록하기")
            .description("잠금 화면에서 바로 기록해요.")
            .supportedFamilies([.accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}

@main
struct MonoWidgets: WidgetBundle {
    var body: some Widget {
        QuickTileWidget()
        HomeBarWidget()
        LockWidget()
    }
}
