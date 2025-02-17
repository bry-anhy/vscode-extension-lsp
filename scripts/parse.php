<?php
// Thay đổi đường dẫn để autoload đúng thư viện php-parser
require __DIR__ . '/../php-libs/vendor/autoload.php';

use PhpParser\ParserFactory;
use PhpParser\NodeDumper;
use PhpParser\Error;
use PhpParser\PhpVersion;

// Đọc mã PHP từ stdin (do VS Code gửi đến)
$code = file_get_contents('php://stdin');

$parser = (new ParserFactory)->create(ParserFactory::PREFER_PHP7);

try {
    $ast = $parser->parse($code);
    $dumper = new NodeDumper;
    echo $dumper->dump($ast);
} catch (Error $e) {
    echo 'Parse error: ', $e->getMessage();
}
?>