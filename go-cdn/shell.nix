{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  packages = with pkgs; [
    go
    gcc
    gnumake
    gotools
    golangci-lint
  ];

  shellHook = ''
    export CGO_ENABLED=1
    export GOPATH=$PWD/.gopath
    export PATH=$GOPATH/bin:$PATH
    echo "Go dev shell ready"
    go version
  '';
}
