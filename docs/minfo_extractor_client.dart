/// minfo_extractor_client.dart
/// ─────────────────────────────────────────────────────────────────────────────
/// Async client for the Minfo Website DNA Extractor REST API.
///
/// Usage:
///   final client = MinfoExtractorClient(
///     baseUrl: 'https://your-railway-url.up.railway.app',
///     apiKey:  'minfo-dart-secret-change-me-in-production',
///   );
///
///   final result = await client.extract(
///     url:        'https://www.scaramucci.net',
///     youtubeUrl: 'https://www.youtube.com/watch?v=qHMEWxMMpiE',   // optional
///     profileUrl: 'https://linktr.ee/anthonyscaramucci',            // optional
///   );
///
///   print(result.placeholderImages);   // List<String> — 2 best hero images
///   print(result.minfoJson);           // Map — ready to POST to Minfo campaign API
/// ─────────────────────────────────────────────────────────────────────────────

import 'dart:convert';
import 'package:http/http.dart' as http;

// ─────────────────────────────────────────────────────────────────────────────
// Data models
// ─────────────────────────────────────────────────────────────────────────────

class ExtractionResult {
  final String? name;
  final String? websiteSummary;
  final String? youtubeSummary;
  final String? combinedSummary;

  /// HTML description ready for flutter_widget_from_html or a WebView
  final String? campaignDescription;

  final String? logoUrl;
  final String? screenshotUrl;

  /// The 2 best placeholder/hero images selected by the AI from the website
  final List<String> placeholderImages;

  // ─── Brand colours ───────────────────────────────────────────────────────
  final String? backgroundColor;
  final String? foregroundColor;
  final String? qrCodeColor;
  final String? backgroundAppBarColor;
  final String? foregroundAppBarColor;
  final String? iconForegroundColorLeft;
  final String? iconBackgroundColorLeft;
  final String? iconForegroundColorRight;
  final String? iconBackgroundColorRight;
  final String? backgroundSelectedColor;

  // ─── Button styles ───────────────────────────────────────────────────────
  /// Each item has:
  ///   shape        ('Square'|'Curved'|'Pill')
  ///   shape_int    (1=Square, 2=Rounded, 3=Pill)
  ///   text_align   ('left'|'center'|'right')
  ///   text_align_int (1=Left, 2=Center, 3=Right)
  ///   + background_color_hex, text_color_hex, border_radius, font_family,
  ///     padding, sample_text, sample_url
  final List<Map<String, dynamic>> buttonStyles;

  // ─── CTAs ────────────────────────────────────────────────────────────────
  final List<Map<String, dynamic>> websiteCtas;
  final List<Map<String, dynamic>> youtubeCtas;
  final List<Map<String, dynamic>> profileCtas;

  // ─── Social links ────────────────────────────────────────────────────────
  final List<String> socialMediaLinks;
  final List<String> youtubeSocialLinks;
  final List<String> profileSocialLinks;

  // ─── YouTube ─────────────────────────────────────────────────────────────
  final Map<String, dynamic>? youtube;

  /// Full Minfo campaign JSON — pass directly to the Minfo campaign import endpoint
  final Map<String, dynamic> minfoJson;

  // ─── Meta ─────────────────────────────────────────────────────────────────
  final bool isWaybackFallback;
  final String? youtubeWarning;
  final int? totalMs;

  const ExtractionResult({
    this.name,
    this.websiteSummary,
    this.youtubeSummary,
    this.combinedSummary,
    this.campaignDescription,
    this.logoUrl,
    this.screenshotUrl,
    required this.placeholderImages,
    this.backgroundColor,
    this.foregroundColor,
    this.qrCodeColor,
    this.backgroundAppBarColor,
    this.foregroundAppBarColor,
    this.iconForegroundColorLeft,
    this.iconBackgroundColorLeft,
    this.iconForegroundColorRight,
    this.iconBackgroundColorRight,
    this.backgroundSelectedColor,
    required this.buttonStyles,
    required this.websiteCtas,
    required this.youtubeCtas,
    required this.profileCtas,
    required this.socialMediaLinks,
    required this.youtubeSocialLinks,
    required this.profileSocialLinks,
    this.youtube,
    required this.minfoJson,
    required this.isWaybackFallback,
    this.youtubeWarning,
    this.totalMs,
  });

  factory ExtractionResult.fromJson(Map<String, dynamic> json) {
    List<String> _strList(dynamic v) =>
        (v as List?)?.map((e) => e.toString()).toList() ?? [];
    List<Map<String, dynamic>> _mapList(dynamic v) =>
        (v as List?)?.map((e) => Map<String, dynamic>.from(e as Map)).toList() ?? [];

    return ExtractionResult(
      name:                     json['name']                       as String?,
      websiteSummary:           json['website_summary']            as String?,
      youtubeSummary:           json['youtube_summary']            as String?,
      combinedSummary:          json['combined_summary']           as String?,
      campaignDescription:      json['campaign_description']       as String?,
      logoUrl:                  json['logo_url']                   as String?,
      screenshotUrl:            json['screenshot_url']             as String?,
      placeholderImages:        _strList(json['placeholder_images']),
      backgroundColor:          json['background_color']           as String?,
      foregroundColor:          json['foreground_color']           as String?,
      qrCodeColor:              json['qr_code_color']              as String?,
      backgroundAppBarColor:    json['background_app_bar_color']   as String?,
      foregroundAppBarColor:    json['foreground_app_bar_color']   as String?,
      iconForegroundColorLeft:  json['icon_foreground_color_left'] as String?,
      iconBackgroundColorLeft:  json['icon_background_color_left'] as String?,
      iconForegroundColorRight: json['icon_foreground_color_right'] as String?,
      iconBackgroundColorRight: json['icon_background_color_right'] as String?,
      backgroundSelectedColor:  json['background_selected_color']  as String?,
      buttonStyles:             _mapList(json['button_styles']),
      websiteCtas:              _mapList(json['website_ctas']),
      youtubeCtas:              _mapList(json['youtube_ctas']),
      profileCtas:              _mapList(json['profile_ctas']),
      socialMediaLinks:         _strList(json['social_media_links']),
      youtubeSocialLinks:       _strList(json['youtube_social_links']),
      profileSocialLinks:       _strList(json['profile_social_links']),
      youtube: json['youtube'] != null
          ? Map<String, dynamic>.from(json['youtube'] as Map)
          : null,
      minfoJson: Map<String, dynamic>.from(
          (json['minfo_campaign'] as Map?) ?? {}),
      isWaybackFallback: json['is_wayback_fallback'] as bool? ?? false,
      youtubeWarning:    json['youtube_warning']      as String?,
      totalMs:           json['total_ms']             as int?,
    );
  }

  @override
  String toString() =>
      'ExtractionResult(name: $name, images: $placeholderImages, '
      'bg: $backgroundColor, buttons: ${buttonStyles.length})';
}


class ExtractionException implements Exception {
  final String message;
  final String? hint;
  final String? stage;
  final int? statusCode;

  const ExtractionException(this.message, {this.hint, this.stage, this.statusCode});

  @override
  String toString() => 'ExtractionException($statusCode): $message${hint != null ? '\nHint: $hint' : ''}';
}

// ─────────────────────────────────────────────────────────────────────────────
// Client
// ─────────────────────────────────────────────────────────────────────────────

class MinfoExtractorClient {
  final String baseUrl;
  final String apiKey;

  /// How often to poll for results (default: every 5 seconds)
  final Duration pollInterval;

  /// Maximum total wait before giving up (default: 3 minutes)
  final Duration timeout;

  final http.Client _http;

  MinfoExtractorClient({
    required this.baseUrl,
    required this.apiKey,
    this.pollInterval = const Duration(seconds: 5),
    this.timeout      = const Duration(minutes: 3),
    http.Client? httpClient,
  }) : _http = httpClient ?? http.Client();

  Map<String, String> get _headers => {
    'Content-Type':  'application/json',
    'Authorization': 'Bearer $apiKey',
  };

  Uri _uri(String path) => Uri.parse('${baseUrl.replaceAll(RegExp(r'/$'), '')}$path');

  // ── Public API ─────────────────────────────────────────────────────────────

  /// Full extraction.
  ///
  /// [url] is required (the brand website).
  /// [youtubeUrl] and [profileUrl] are optional.
  ///
  /// Throws [ExtractionException] on failure.
  Future<ExtractionResult> extract({
    required String url,
    String? youtubeUrl,
    String? profileUrl,
    void Function(String status)? onProgress,
  }) async {
    // Step 1 — kick off the job
    final jobId = await _startJob(
      url:        url,
      youtubeUrl: youtubeUrl,
      profileUrl: profileUrl,
    );
    onProgress?.call('pending');

    // Step 2 — poll until done
    final deadline = DateTime.now().add(timeout);
    while (DateTime.now().isBefore(deadline)) {
      await Future.delayed(pollInterval);

      final (status, data) = await _pollJob(jobId);
      onProgress?.call(status);

      if (status == 'complete' && data != null) {
        return ExtractionResult.fromJson(data);
      }
      if (status == 'failed') {
        throw ExtractionException(
          (data?['error'] as String?) ?? 'Unknown extraction error',
          hint:       data?['hint']  as String?,
          stage:      data?['stage'] as String?,
          statusCode: 422,
        );
      }
      // status == 'pending' or 'running' — keep polling
    }
    throw const ExtractionException(
      'Extraction timed out — the server is taking too long. Try again in a moment.',
      statusCode: 408,
    );
  }

  /// Verify the API key and server connectivity.
  Future<Map<String, dynamic>> healthCheck() async {
    final response = await _http.get(_uri('/api/dart/health'), headers: _headers);
    _assertOk(response);
    return jsonDecode(response.body) as Map<String, dynamic>;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  Future<String> _startJob({
    required String url,
    String? youtubeUrl,
    String? profileUrl,
  }) async {
    final body = <String, String>{'url': url};
    if (youtubeUrl != null) body['youtube_url'] = youtubeUrl;
    if (profileUrl != null) body['profile_url'] = profileUrl;

    final response = await _http.post(
      _uri('/api/dart/extract'),
      headers: _headers,
      body:    jsonEncode(body),
    );

    if (response.statusCode == 401) {
      throw const ExtractionException('Invalid API key', statusCode: 401);
    }
    if (response.statusCode == 400) {
      final body = jsonDecode(response.body) as Map;
      throw ExtractionException(
          body['error']?.toString() ?? 'Bad request', statusCode: 400);
    }
    if (response.statusCode == 429) {
      throw const ExtractionException(
          'Rate limit reached — wait 1 minute and try again.', statusCode: 429);
    }
    _assertOk(response, expectedCode: 202);

    final json = jsonDecode(response.body) as Map<String, dynamic>;
    final jobId = json['job_id'] as String?;
    if (jobId == null) throw const ExtractionException('Server did not return a job_id');
    return jobId;
  }

  /// Returns (status, payload).
  /// status is one of: 'pending', 'running', 'complete', 'failed'
  Future<(String, Map<String, dynamic>?)> _pollJob(String jobId) async {
    final response = await _http.get(
      _uri('/api/dart/result/$jobId'),
      headers: _headers,
    );

    if (response.statusCode == 404) {
      throw const ExtractionException('Job not found or expired', statusCode: 404);
    }

    final json = jsonDecode(response.body) as Map<String, dynamic>;
    final status = json['status'] as String? ?? 'unknown';

    if (status == 'complete') {
      return ('complete', json['data'] as Map<String, dynamic>?);
    }
    if (status == 'failed') {
      return ('failed', json);
    }
    return (status, null);
  }

  void _assertOk(http.Response response, {int expectedCode = 200}) {
    if (response.statusCode != expectedCode && response.statusCode ~/ 100 != 2) {
      throw ExtractionException(
        'Unexpected HTTP ${response.statusCode}: ${response.body}',
        statusCode: response.statusCode,
      );
    }
  }

  void dispose() => _http.close();
}

// ─────────────────────────────────────────────────────────────────────────────
// Quick integration test (run with: dart minfo_extractor_client.dart)
// ─────────────────────────────────────────────────────────────────────────────

void main() async {
  const baseUrl = 'http://localhost:3001';          // ← change to Railway URL in prod
  const apiKey  = 'minfo-dart-secret-change-me-in-production';

  final client = MinfoExtractorClient(baseUrl: baseUrl, apiKey: apiKey);

  try {
    print('🔍 Health check...');
    final health = await client.healthCheck();
    print('  Server: ${health['dart_api']} | Key: ${health['dart_api_key']}');

    print('\n🚀 Starting extraction...');
    final result = await client.extract(
      url:        'https://www.scaramucci.net',
      youtubeUrl: 'https://www.youtube.com/watch?v=qHMEWxMMpiE',
      profileUrl: 'https://linktr.ee/anthonyscaramucci',
      onProgress: (s) => print('  Status: $s'),
    );

    print('\n✅ Extraction complete!');
    print('  Name:               ${result.name}');
    print('  Logo:               ${result.logoUrl}');
    print('  Placeholder images: ${result.placeholderImages}');
    print('  Background color:   ${result.backgroundColor}');
    print('  Social links:       ${result.socialMediaLinks}');
    print('  Total time:         ${result.totalMs}ms');

    if (result.youtube != null) {
      print('\n  YouTube: "${result.youtube!['title']}" by ${result.youtube!['channel']}');
    }
  } on ExtractionException catch (e) {
    print('❌ Extraction failed: $e');
  } finally {
    client.dispose();
  }
}
