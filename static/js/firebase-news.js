$(function() {
    var ROOT = new Firebase('http://gamma.firebase.com/firebase_news');
    var LINKS = ROOT.child('links');
    var USERS = ROOT.child('users');
    var COMMENTS = ROOT.child('comments');
    var SORTING_ENABLED = false;
    var editing = null;

    var linkify = function(link) {
        var a = document.createElement('a');
        a.href = link;
        return a.href;
    }

    var handleSubmit = function(event) {
        var btn = $('#submit');
        btn.prop('disabled', true);
        var urlInput = $('#submit-url');
        var titleInput = $('#link-title');
        var link = linkify(urlInput.val());
        var title = titleInput.val() || link;
        urlInput.val('');
        titleInput.val('');
        var data = {
            title: title,
            link: link,
            user: thisUser.name,
            votes: {},
            comments: 0
        };
        data.votes[thisUser.ref.name()] = true;
        LINKS.push(data);
        btn.prop('disabled', false);
    };

    var intCmp = function(a, b) {
        if (a > b) return -1;
        if (a == b) return 0;
        return 1;
    }

    var valWrapper = function(fn) {
        return function(a, b) {
            if (typeof(a.val) == 'function') {
                return fn(a.val(), b.val());
            } else {
                return fn(a, b);
            }
        }
    }

    var upvoteSort = function(a, b) {
        return intCmp((a.up || []).length, (b.up || []).length)
    };

    var totalSort = function(a, b) {
        return intCmp(
            (a.up || []).length - (a.down || []).length,
            (b.up || []).length - (b.down || []).length
        );
    };

    var sortScorable = function(scorables) {
        if (SORTING_ENABLED) {
            scorables.sort(valWrapper(totalSort));
        }
    }

    var sortComments = function(comments) {
        var commentIndex = [];
        $.each(comments, function(index, comment) {
            commentIndex.push({
                i: index,
                up: comment.up || [],
                down: comment.down || []
            });
        });
        if (SORTING_ENABLED) {
            commentIndex.sort(totalSort);
        }
        return commentIndex;
    };

    // reply handling
    var replyCancel = function(event) {
        var div = $(event.target).closest('div.new-comment');
        var title = div.closest('.comment').length ? 'Reply' : 'Comment';
        div.html(ADD_COMMENT_TEMPLATE({
            editing: false,
            canEdit: true,
            title: title
        }));
    };

    var replySubmit = function(event) {
        var btn = $(event.target);
        var commentText = btn.siblings('.comment-text').val();
        var refString = btn.closest('div.comment-list').attr('id');
        var comment = {
            text: commentText,
            user: thisUser.name,
            votes: {}
        };
        comment.votes[thisUser.ref.name()] = true;
        var ref = new Firebase(refString).push(comment);

        var storyRefString = $('div.story').attr('id');
        new Firebase(storyRefString).child('comments').transaction(function(data) {
            return data + 1;
        }, function(success) {
            if (!success) console.warn('failed to update comment count');
        });

        replyCancel(event);
    };

    var replyHandler = function(event) {
        event.preventDefault();
        var div = $(event.target).closest('div.new-comment');
        div.html(ADD_COMMENT_TEMPLATE({
            editing: true,
            canEdit: true,
            title: 'reply'
        }));
        $(div).find('.comment-text').focus();
    };

    // Comment rendering
    var ADD_COMMENT_TEMPLATE = _.template($('#add-comment-template').html());
    var COMMENT_TEMPLATE = _.template($('#comment-template').html());
    var renderCommentList = function(ul, comments, parentRef) {
        var commentIndices = sortComments(comments);
        var commentsRef = parentRef.child('comments');
        for (var i = 0; i < commentIndices.length; ++i) {
            var cIndex = commentIndices[i];
            var comment = comments[cIndex.i];
            var refString = commentsRef.child(cIndex.i).toString();
            var li = $(COMMENT_TEMPLATE({
                refString: refString,
                username: thisUser && comment.user == thisUser.name ? "You" : comment.user,
                scoreWidget: scoreElement(comment),
                voteCount: voteCountElement(comment),
                text: comment.text,
                replyWidget: ADD_COMMENT_TEMPLATE({
                    editing: false,
                    canEdit: thisUser != null,
                    title: "Reply"
                })
            }));

            // add next thread
            var nextComments = comment['comments'] || [];
            var nextUl = $('<ul/>');
            renderCommentList(nextUl, nextComments, new Firebase(refString));
            li.append(nextUl);
            ul.append(li);
        }
    };

    var showCommentsHandler = function(event) {
        event.preventDefault();
        var a = $(event.target);
        var li = a.closest('li');
        var refString = li.attr('id');
        toggleComments(refString);
    };

    var toggleComments = function(refString) {
        var li = $('li[id="' + refString + '"]');
        var a = li.find('.comments-opener');
        if (a.hasClass('show-comments')) {
            // show the comments
            window.location.hash = new Firebase(refString).name();
        } else {
            // remove the hash, render the stories
            window.location.hash = "";
        }
        route();
    };

    var storyAdded = function(snapshot, prevChild) {
        snapshot.ref().on('value', storyChanged);
        var li = $('<li/>');
        li.addClass('ref')
        li.addClass('story');
        li.attr('id', snapshot.ref().toString());
        li.html(renderStory(snapshot.val(), false));
        $('#links').append(li);
    };

    var storyChanged = function(snapshot, prevChild) {
        var refString = snapshot.ref().toString();
        var el = $('[id="' + refString + '"]');
        el.html(renderStory(snapshot.val(), false));
    };

    var commentStoryChanged = function(snapshot, prevChild) {
        var refString = snapshot.ref().toString();
        var div = $('div[id="' + refString + '"]');
        var story = snapshot.val();
        if (story) {
            div.html(renderStory(snapshot.val(), true));
        } else {
            window.location.hash = "";
            route();
        }
    }

    var storyRemoved = function(snapshot) {

    };

    var COMMENT_DATA_TEMPLATE = _.template($('#comment-data-template').html());
    var commentData = function(comment) {
        return COMMENT_DATA_TEMPLATE({
            username: thisUser && comment.user == thisUser.name ? "You" : comment.user,
            scoreElement: scoreElement(comment.votes),
            voteElement: voteElement(comment.votes),
            text: comment.text
        });
    };

    var commentChanged = function(snapshot, prevChild) {
        var refString = snapshot.ref().toString();
        var comment = snapshot.val();
        if (comment) {
            $('.comment[id="' + refString + '"]').children('.comment-data').html(commentData(comment));
        } else {
            $('.comment[id="' + refString + '"]').remove();
        }
    };

    var commentAdded = function(snapshot, prevChild) {
        var parentRefString = snapshot.ref().parent().toString();
        var ul = $('div.comment-list[id="' + parentRefString + '"]').children('ul.comments');
        var refString = snapshot.ref().toString();
        var comment = snapshot.val();
        var li = $(COMMENT_TEMPLATE({
            refString: refString,
            commentData: commentData(comment),
            replyWidget: ADD_COMMENT_TEMPLATE({
                editing: false,
                canEdit: thisUser != null,
                title: "Reply"
            })
        }));
        ul.append(li);
        snapshot.ref().on('value', commentChanged);
        snapshot.ref().child('comments').on('child_added', commentAdded);
    };

    var commentRemoved = function(snapshot) {

    };

    // Scoring
    var SCORE_TEMPLATE = _.template($('#score-template').html());
    var scoreElement = function(votes) {
        if (!votes) votes = {};
        var total = _.size(votes);
        var upCount = _.reduce(votes, function(accum, val, key) { return val ? accum + 1 : accum}, 0);
        var downCount = total - upCount;
        if (upCount) upCount = "+" + upCount;
        if (downCount) downCount = "-" + downCount;
        return SCORE_TEMPLATE({
            upCount: upCount,
            downCount: downCount
        });
    };

    // Story rendering
    var siteForLink = function(link) {
        var a = document.createElement('a');
        a.href = link;
        return a.hostname;
    }

    var countComments = function(initial, parent) {
        var comments = parent.comments || {};
        return initial + _.reduce(comments, countComments, _.size(comments));
    }

    var STORY_TEMPLATE = _.template($('#story-template').html());
    var renderStory = function(story_data, expanded) {
        // remove it if it exists already. Note that the hash includes '#'
        var vote = voteElement(story_data.votes);
        var score = scoreElement(story_data.votes);
        var site = siteForLink(story_data.link);
        var storyHtml = $(STORY_TEMPLATE({
            voteElement: vote,
            link: story_data.link,
            title: story_data.title,
            scoreElement: score,
            site: site,
            commentCount: story_data.comments,
            expanded: expanded
        }));
        return storyHtml;
    };

    // auth
    var thisUser = null;
    var handleAuth = function() {
        var login = function(username, remember) {
            $('#login-div').hide();
            $('#submit-div').show();
            $('#user-display').text(username);
            thisUser = {name: username, ref: USERS.child(username)};
            if (remember) {
                $.cookie('username', username);
            } else {
                $.cookie('username', null);
            }
            route();
        };
        $('#login').click(function(event) {
            var username = $('#username').val();
            var remember = typeof($('#remember').attr('checked')) != 'undefined';
            USERS.child(username).transaction(function(userData) {
                if (!userData || remember != userData.remember) {
                    return {remember: remember};
                }
            }, function(success) {
                login(username, remember);
            });
        });
        $('#submit-div').hide();
        var cookiedUser = $.cookie('username');
        if (cookiedUser) {
            login(cookiedUser, true);
        } else {
            route();
        }
    };

    var logout = function() {
        $('#login-div').show();
        $('#submit-div').hide();
        $.cookie('username', null);
        thisUser = null;
        route();
    };

    // Voting
    var VOTE_TEMPLATE = _.template($('#vote-template').html());
    var voteElement = function(votes) {
        if (!votes) votes = {};
        var voted = null;
        if (thisUser) {
            var username = thisUser.ref.name();
            if (typeof(votes[username]) != 'undefined') {
                voted = votes[username] ? 'up' : 'down';
            }
        }
        return VOTE_TEMPLATE({
            voted: voted,
            showVotes: thisUser != null
        });
    };

    var handleVote = function(event) {
        event.preventDefault();
        var a = $(event.target);
        var toSet = a.hasClass('voted') ? null : a.hasClass('up');
        var refString = a.closest('.ref').attr('id');
        new Firebase(refString).child('votes').child(thisUser.ref.name()).set(toSet);
    };

    // Routing
    var mainPage = function() {
        var content = $('#content');
        content.empty();
        var ul = $('<ul/>');
        ul.attr('id', 'links');
        content.append(ul);
        LINKS.on('child_added', storyAdded);
        LINKS.on('child_removed', storyRemoved);
        $(document).on('click', '.comments-opener', showCommentsHandler);
        $(document).on('click', '.vote', handleVote);
        return function() {
            LINKS.off('child_added', storyAdded);
            LINKS.off('child_removed', storyRemoved);
            $(document).off('click', '.comments-opener', showCommentsHandler);
            $(document).off('click', '.vote', handleVote);
            $('li.story').each(function(i, li) {
                var refString = $(li).attr('id');
                var storyRef = new Firebase(refString);
                storyRef.off('value', storyChanged);
            });
        };
    };

    var storyPage = function(refString) {
        var storyRef = new Firebase(refString);
        var commentsRef = COMMENTS.child(storyRef.name());
        var content = $('#content');

        content.empty();
        // story / headline div
        var div = $('<div/>');
        div.attr('id', refString);
        div.addClass('ref');
        div.addClass('story');

        content.append(div);

        // comments list
        div = $('<div/>');
        div.addClass('comment-list');
        div.attr('id', commentsRef.toString());
        div.html(ADD_COMMENT_TEMPLATE({editing: false, canEdit: thisUser != null, title: 'Comment'}));
        var ul = $('<ul/>');
        ul.addClass('comments');
        div.append(ul);
        content.append(div);

        // listeners
        storyRef.on('value', commentStoryChanged);
        commentsRef.on('child_added', commentAdded);
        $(document).on('click', '.comments-opener', showCommentsHandler);
        $(document).on('click', '.vote', handleVote);
        $(document).on('click', '.comment-reply', replyHandler);
        $(document).on('click', '.comment-submit', replySubmit);
        $(document).on('click', '.comment-cancel', replyCancel);
        return function() {
            $('.comment').each(function(i, el) {
                var refString = $(el).attr('id');
                var commentRef = new Firebase(refString);
                commentRef.off('value', commentChanged);
                var comments = commentRef.child('comments');
                comments.off('child_added', commentAdded);
                comments.off('child_removed', commentRemoved);
            });
            storyRef.off('value', storyChanged);
            commentsRef.off('child_added', commentAdded);
            $(document).off('click', '.comments-opener', showCommentsHandler);
            $(document).off('click', '.vote', handleVote);
            $(document).off('click', '.comment-reply', replyHandler);
            $(document).off('click', '.comment-submit', replySubmit);
            $(document).off('click', '.comment-cancel', replyCancel);
        };
    };

    var cleanup = function() {};
    var route = function() {
        cleanup();
        if (window.location.hash) {
            cleanup = storyPage(LINKS.child(window.location.hash.substr(1)).toString());
        } else {
            cleanup = mainPage();
        }
    };


    $('#submit').click(handleSubmit);
    $('#logout').click(logout);
    $(document).on('keypress', '.comment-text', function(event) {
        if ((event.keyCode || event.which) == '13' && !event.shiftKey) {
            $(event.target).siblings('.comment-submit').click();
        }
    });
    handleAuth();
});
