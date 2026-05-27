source "https://rubygems.org"

ruby "~> 3.4"

gem "jekyll", "~> 4.4"

# Required gems for Ruby 3.4+ compatibility
gem "base64"
gem "logger"
gem "bigdecimal"
gem "csv"
gem "kramdown-parser-gfm"

group :jekyll_plugins do
  gem "jekyll-feed", "~> 0.17"
  gem "jekyll-seo-tag", "~> 2.8"
  gem "jekyll-redirect-from", "~> 0.16"
  gem "jekyll-paginate", "~> 1.1"
end

# Windows and JRuby does not include zoneinfo files
platforms :mingw, :x64_mingw, :mswin, :jruby do
  gem "tzinfo", ">= 1", "< 3"
  gem "tzinfo-data"
end

# Performance-booster for watching directories on Windows
gem "wdm", "~> 0.1.1", :platforms => [:mingw, :x64_mingw, :mswin]
