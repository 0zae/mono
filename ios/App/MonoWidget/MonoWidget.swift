import WidgetKit
import SwiftUI

// Mono 위젯: 데이터 없이 누르면 바로 기록(또는 스캔)으로 가는 버튼 위젯
//  A · 주황 한 칸 (작은 크기)   C · 첫 화면 축소판 (중간 크기)   D · 잠금 화면 (동그라미·직사각형·한 줄)
//  누르면 mono://quick (입력칸) / mono://scan (영수증 스캔) 으로 앱을 연다

private let monoOrange = Color(red: 1, green: 90/255, blue: 46/255)
private let quickURL = URL(string: "mono://quick")!
private let scanURL = URL(string: "mono://scan")!

struct MonoEntry: TimelineEntry { let date: Date }

struct MonoProvider: TimelineProvider {
    func placeholder(in context: Context) -> MonoEntry { MonoEntry(date: .now) }
    func getSnapshot(in context: Context, completion: @escaping (MonoEntry) -> Void) { completion(MonoEntry(date: .now)) }
    func getTimeline(in context: Context, completion: @escaping (Timeline<MonoEntry>) -> Void) {
        completion(Timeline(entries: [MonoEntry(date: .now)], policy: .never)) // 내용이 바뀌지 않는 버튼이라 새로 그릴 필요 없음
    }
}

// A · 주황 한 칸
struct QuickTileView: View {
    var body: some View {
        VStack(alignment: .leading) {
            Image("Logo").resizable().scaledToFit().frame(height: 22) // 주황 바탕이라 흰 글자만 보인다
            Spacer()
            HStack(spacing: 6) {
                Image(systemName: "plus").font(.system(size: 18, weight: .bold))
                Text("기록하기").font(.system(size: 19, weight: .bold))
            }
            .foregroundStyle(.white)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .containerBackground(monoOrange, for: .widget)
        .widgetURL(quickURL)
    }
}

// C · 첫 화면 축소판: 로고 + 입력창(기록하기) + 오른쪽 스캔
struct HomeBarView: View {
    var body: some View {
        VStack(spacing: 14) {
            Image("Logo").resizable().scaledToFit().frame(height: 26)
            HStack(spacing: 8) {
                Link(destination: quickURL) {
                    HStack(spacing: 8) {
                        Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
                        Text("기록하기").foregroundStyle(.secondary)
                        Spacer(minLength: 0)
                    }
                    .font(.system(size: 15))
                    .frame(maxHeight: .infinity)
                }
                Link(destination: scanURL) {
                    Image(systemName: "doc.viewfinder")
                        .font(.system(size: 18, weight: .regular))
                        .foregroundStyle(monoOrange)
                        .frame(width: 36, height: 36)
                }
            }
            .padding(.leading, 14).padding(.trailing, 4)
            .frame(height: 44)
            .background(Capsule().fill(Color(.tertiarySystemFill)))
        }
        .containerBackground(for: .widget) { Color(.systemBackground) }
        .widgetURL(quickURL)
    }
}

// D · 잠금 화면
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
        StaticConfiguration(kind: "MonoQuickTile", provider: MonoProvider()) { _ in QuickTileView() }
            .configurationDisplayName("기록하기")
            .description("누르면 바로 기록해요.")
            .supportedFamilies([.systemSmall])
    }
}

struct HomeBarWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "MonoHomeBar", provider: MonoProvider()) { _ in HomeBarView() }
            .configurationDisplayName("기록하기")
            .description("입력창을 누르면 기록, 오른쪽은 영수증 스캔.")
            .supportedFamilies([.systemMedium])
    }
}

struct LockWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "MonoLock", provider: MonoProvider()) { _ in LockView() }
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
