from backend.capture import parse_source


def test_index_is_parsed_as_integer():
    assert parse_source("0") == 0
    assert parse_source(" 1 ") == 1


def test_url_is_kept_as_string():
    url = "rtsp://host:554/live"
    assert parse_source(url) == url


def test_path_is_kept_as_string():
    assert parse_source("/dev/video2") == "/dev/video2"
