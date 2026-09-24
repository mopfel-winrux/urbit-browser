const std = @import("std");

// zig build              -> bundle the JS runtime and assemble desk/ into zig-out/
// zig build -Ddesk=PATH  -> also replace the contents of a mounted desk with it
// zig build clean        -> remove zig-out/
//
// The desk is self-contained (base libraries and urwasm are vendored), so no
// network access is needed. Node 18+ is required to bundle the JS runtime.

const Action = enum { build, clean };

const DeskStep = struct {
    step: std.Build.Step,
    action: Action,
    install_path: []const u8,
    desk_path: ?[]const u8,

    fn create(b: *std.Build, name: []const u8, action: Action, desk_path: ?[]const u8) *DeskStep {
        const self = b.allocator.create(DeskStep) catch @panic("OOM");
        self.* = .{
            .step = std.Build.Step.init(.{ .id = .custom, .name = name, .owner = b, .makeFn = make }),
            .action = action,
            .install_path = b.install_path,
            .desk_path = desk_path,
        };
        return self;
    }

    fn make(step: *std.Build.Step, _: std.Build.Step.MakeOptions) !void {
        const self: *DeskStep = @fieldParentPtr("step", step);
        switch (self.action) {
            .build => try buildDesk(step, self.install_path, self.desk_path),
            .clean => std.fs.cwd().deleteTree(self.install_path) catch {},
        }
    }
};

pub fn build(b: *std.Build) void {
    const desk_path = b.option([]const u8, "desk", "Replace this mounted desk after building");
    const assemble = DeskStep.create(b, "assemble desk", .build, desk_path);
    b.default_step.dependOn(&assemble.step);
    b.step("build", "Bundle the runtime and assemble the desk").dependOn(&assemble.step);
    const clean = DeskStep.create(b, "clean output", .clean, null);
    b.step("clean", "Remove assembled output").dependOn(&clean.step);
}

fn buildDesk(step: *std.Build.Step, install_path: []const u8, desk_path: ?[]const u8) !void {
    const allocator = step.owner.allocator;
    try run(step, &.{ "node", "scripts/build-runtime.mjs" });
    std.fs.cwd().deleteTree(install_path) catch {};
    try std.fs.cwd().makePath(install_path);
    try copyDir(allocator, "desk", install_path);
    if (desk_path) |raw| {
        const target = try expandHome(allocator, raw);
        std.fs.cwd().access(target, .{}) catch return step.fail("desk path '{s}' does not exist", .{target});
        // a mounted desk keeps its own .git-free tree; replace it wholesale
        var dir = try std.fs.cwd().openDir(target, .{ .iterate = true });
        defer dir.close();
        var it = dir.iterate();
        while (try it.next()) |entry| {
            if (std.mem.eql(u8, entry.name, ".git")) continue;
            try dir.deleteTree(entry.name);
        }
        try copyDir(allocator, install_path, target);
        std.debug.print("replaced desk at {s}\n", .{target});
    }
}

fn run(step: *std.Build.Step, argv: []const []const u8) !void {
    var child = std.process.Child.init(argv, step.owner.allocator);
    child.stdin_behavior = .Inherit;
    child.stdout_behavior = .Inherit;
    child.stderr_behavior = .Inherit;
    const term = try child.spawnAndWait();
    switch (term) {
        .Exited => |code| if (code != 0) return step.fail("{s} exited with {d}", .{ argv[0], code }),
        else => return step.fail("{s} terminated abnormally", .{argv[0]}),
    }
}

fn copyDir(allocator: std.mem.Allocator, from: []const u8, to: []const u8) !void {
    var src = try std.fs.cwd().openDir(from, .{ .iterate = true });
    defer src.close();
    try std.fs.cwd().makePath(to);
    var walker = try src.walk(allocator);
    defer walker.deinit();
    while (try walker.next()) |entry| {
        const dest = try std.fs.path.join(allocator, &.{ to, entry.path });
        switch (entry.kind) {
            .directory => try std.fs.cwd().makePath(dest),
            .file => {
                if (std.fs.path.dirname(dest)) |parent| try std.fs.cwd().makePath(parent);
                try src.copyFile(entry.path, std.fs.cwd(), dest, .{});
            },
            else => {},
        }
    }
}

fn expandHome(allocator: std.mem.Allocator, path: []const u8) ![]const u8 {
    if (path.len > 0 and path[0] == '~') {
        const home = std.posix.getenv("HOME") orelse return error.NoHome;
        return std.fs.path.join(allocator, &.{ home, path[1..] });
    }
    return path;
}
