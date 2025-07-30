{
  description = "Android development environment with Android Studio";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    android-nixpkgs = {
      url = "github:tadfisher/android-nixpkgs";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { self, nixpkgs, flake-utils, android-nixpkgs }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
        
        android-sdk = android-nixpkgs.sdk.${system} (sdkPkgs: with sdkPkgs; [
          cmdline-tools-latest
          build-tools-34-0-0
          platform-tools
          platforms-android-34
          platforms-android-33
          emulator
        ]);
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            android-studio
            android-sdk
            jdk17
            nodejs_20
            git
            gradle
          ];

          shellHook = ''
            export ANDROID_HOME="${android-sdk}/share/android-sdk"
            export ANDROID_SDK_ROOT="$ANDROID_HOME"
            export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/build-tools/34.0.0:$PATH"
            
            echo "Android development environment loaded!"
            echo "Android SDK: $ANDROID_HOME"
            echo "Java: $(java -version 2>&1 | head -n1)"
            echo "Node: $(node --version)"
            echo "Gradle: $(gradle --version | head -n1)"
          '';
        };
      }
    );
}